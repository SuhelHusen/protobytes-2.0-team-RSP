// ==========================================
// AI Provider Abstraction — Ollama / OpenAI / Gemini / Mock
// ==========================================
// Switch via AI_PROVIDER env var:
// - ollama
// - openai
// - gemini
// - auto (try configured providers, then mock)
// - mock (deterministic offline fallback)

import OpenAI from 'openai';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// -------------------------------------------
// Shared Interfaces
// -------------------------------------------
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  embed(texts: string[]): Promise<number[][]>;
  embeddingDimension: number;
}

type NamedProvider = {
  name: string;
  provider: AIProvider;
};

const TARGET_EMBEDDING_DIMENSION = 768;

function isLikelyPlaceholder(value?: string): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return normalized.includes('xxxxxxxx') || normalized.includes('replace');
}

function hasUsableKey(value?: string): boolean {
  return !!value && !isLikelyPlaceholder(value);
}

function fitEmbedding(values: number[], targetDim: number): number[] {
  if (values.length === targetDim) return values;
  if (values.length > targetDim) return values.slice(0, targetDim);
  return [...values, ...new Array(targetDim - values.length).fill(0)];
}

function buildMockEmbedding(text: string, dimension: number): number[] {
  const vector = new Array(dimension).fill(0);
  const source = text || 'empty';

  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    const index = (code * (i + 1)) % dimension;
    vector[index] += 1 + (code % 11) / 10;
  }

  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);

  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

function normalizeBaseUrl(value?: string): string {
  const raw = (value || 'http://127.0.0.1:11434').trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === 'number');
}

// -------------------------------------------
// Ollama Provider
// -------------------------------------------
class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private chatModel: string;
  private embedModel: string;
  embeddingDimension = TARGET_EMBEDDING_DIMENSION;

  constructor() {
    this.baseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL);
    this.chatModel = (process.env.OLLAMA_MODEL || 'gemma3:4b').trim();
    this.embedModel = (
      process.env.OLLAMA_EMBED_MODEL ||
      process.env.OLLAMA_EMBEDDING_MODEL ||
      'nomic-embed-text'
    ).trim();
  }

  private async postJson(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Ollama request failed at ${path} (${response.status}): ${text.slice(0, 280)}`
      );
    }

    const json = (await response.json()) as unknown;
    if (!json || typeof json !== 'object') {
      throw new Error(`Ollama returned a non-JSON response for ${path}`);
    }
    return json as Record<string, unknown>;
  }

  private async getAvailableModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object') return [];

    const models = (payload as Record<string, unknown>).models;
    if (!Array.isArray(models)) return [];

    const names = models
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return '';
        const name = (entry as Record<string, unknown>).name;
        return typeof name === 'string' ? name.trim() : '';
      })
      .filter((name): name is string => !!name);

    return names;
  }

  private shouldTryAnotherModel(error: unknown): boolean {
    const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
    return (
      message.includes('model') &&
      (message.includes('not found') || message.includes('pull'))
    );
  }

  private async switchToAvailableModel(): Promise<boolean> {
    try {
      const available = await this.getAvailableModels();
      if (available.length === 0) return false;
      if (available.includes(this.chatModel)) return false;

      const preferredOrder = ['gemma3:4b', 'llama3.2:3b', 'llama3.1:8b', 'mistral:7b'];
      const selected = preferredOrder.find((model) => available.includes(model)) ?? available[0];

      if (!selected || selected === this.chatModel) return false;

      console.warn(
        `⚠️  Ollama model "${this.chatModel}" not available locally. Switching to "${selected}".`
      );
      this.chatModel = selected;
      return true;
    } catch {
      return false;
    }
  }

  private parseBatchEmbeddings(payload: Record<string, unknown>): number[][] {
    const vectors: number[][] = [];

    if (Array.isArray(payload.embeddings)) {
      for (const item of payload.embeddings) {
        if (Array.isArray(item)) {
          const values = toNumberArray(item);
          if (values.length) vectors.push(values);
          continue;
        }
        if (item && typeof item === 'object') {
          const nested = toNumberArray((item as Record<string, unknown>).embedding);
          if (nested.length) vectors.push(nested);
        }
      }
    }

    if (vectors.length === 0) {
      const single = toNumberArray(payload.embedding);
      if (single.length) vectors.push(single);
    }

    return vectors;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    let response: Record<string, unknown>;
    try {
      response = await this.postJson('/api/chat', {
        model: this.chatModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 2000,
        },
      });
    } catch (error) {
      if (this.shouldTryAnotherModel(error)) {
        const switched = await this.switchToAvailableModel();
        if (switched) {
          response = await this.postJson('/api/chat', {
            model: this.chatModel,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
            options: {
              temperature: options.temperature ?? 0.3,
              num_predict: options.maxTokens ?? 2000,
            },
          });
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const message = response.message;
    if (message && typeof message === 'object') {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string' && content.trim()) return content;
    }

    if (typeof response.response === 'string' && response.response.trim()) {
      return response.response;
    }

    throw new Error('Ollama returned an empty chat response');
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Newer Ollama endpoint with batch input
    try {
      const batchResponse = await this.postJson('/api/embed', {
        model: this.embedModel,
        input: texts,
      });
      const batchVectors = this.parseBatchEmbeddings(batchResponse);
      if (batchVectors.length === texts.length) {
        return batchVectors.map((values) => fitEmbedding(values, this.embeddingDimension));
      }
    } catch (error) {
      const message = (error as { message?: string })?.message || 'unknown error';
      console.warn(`⚠️  Ollama batch embedding failed: ${message}`);
    }

    // Legacy Ollama endpoint (single prompt per request)
    try {
      const vectors: number[][] = [];
      for (const text of texts) {
        const response = await this.postJson('/api/embeddings', {
          model: this.embedModel,
          prompt: text,
        });
        const values = toNumberArray(response.embedding);
        if (values.length === 0) {
          throw new Error('Ollama did not return embedding values');
        }
        vectors.push(fitEmbedding(values, this.embeddingDimension));
      }
      return vectors;
    } catch (error) {
      const message = (error as { message?: string })?.message || 'unknown error';
      console.warn(`⚠️  Ollama embedding unavailable (${message}); using local fallback embeddings.`);
      return texts.map((text) => buildMockEmbedding(text, this.embeddingDimension));
    }
  }
}

// -------------------------------------------
// OpenAI Provider
// -------------------------------------------
class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  embeddingDimension = TARGET_EMBEDDING_DIMENSION;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2000,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const batchSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
        dimensions: this.embeddingDimension,
      });
      allEmbeddings.push(...response.data.map((d) => d.embedding));
    }

    return allEmbeddings;
  }
}

// -------------------------------------------
// Gemini Provider
// -------------------------------------------
class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  embeddingDimension = TARGET_EMBEDDING_DIMENSION;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');
    const lastMessage = userMessages[userMessages.length - 1];

    if (!lastMessage) {
      return 'No user message was provided.';
    }

    const history = userMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

    const chat = this.model.startChat({
      history,
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 2000,
      },
      ...(systemMsg
        ? { systemInstruction: { role: 'user' as const, parts: [{ text: systemMsg.content }] } }
        : {}),
    });

    const result = await chat.sendMessage(lastMessage.content);
    return result.response.text();
  }

  async embed(texts: string[]): Promise<number[][]> {
    const embeddingModel = this.genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const allEmbeddings: number[][] = [];
    const batchSize = 64;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        const requestPayload: any = {
          requests: batch.map((text) => ({
            content: { role: 'user' as const, parts: [{ text }] },
            outputDimensionality: this.embeddingDimension,
          })),
        };
        const result: any = await (embeddingModel as any).batchEmbedContents(requestPayload);
        allEmbeddings.push(
          ...result.embeddings.map((e: any) => fitEmbedding(e.values, this.embeddingDimension))
        );
      } catch (_batchError) {
        // Older SDKs/accounts may not support batch embedding with this model.
        for (const text of batch) {
          const single: any = await embeddingModel.embedContent(text);
          allEmbeddings.push(fitEmbedding(single.embedding.values, this.embeddingDimension));
        }
      }
    }

    return allEmbeddings;
  }
}

// -------------------------------------------
// Mock Provider (offline fallback)
// -------------------------------------------
class MockProvider implements AIProvider {
  embeddingDimension = TARGET_EMBEDDING_DIMENSION;

  async chat(messages: ChatMessage[]): Promise<string> {
    const userMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const preview = userMessage.replace(/\s+/g, ' ').trim().slice(0, 240);

    if (!preview) {
      return 'Demo mode is active. Configure AI keys to enable live model responses.';
    }

    return `Demo mode response: AI provider fallback is active. Your API is working and received: "${preview}".`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => buildMockEmbedding(text, this.embeddingDimension));
  }
}

// -------------------------------------------
// Composite Provider (tries providers in order)
// -------------------------------------------
class CompositeProvider implements AIProvider {
  constructor(private readonly chain: NamedProvider[]) {}

  get embeddingDimension(): number {
    return this.chain[0]?.provider.embeddingDimension ?? TARGET_EMBEDDING_DIMENSION;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    let lastError: unknown;

    for (const entry of this.chain) {
      try {
        return await entry.provider.chat(messages, options);
      } catch (error) {
        lastError = error;
        const message = (error as { message?: string })?.message || 'unknown error';
        console.warn(`⚠️  ${entry.name} chat failed: ${message}`);
      }
    }

    throw lastError ?? new Error('All AI providers failed for chat');
  }

  async embed(texts: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (const entry of this.chain) {
      try {
        return await entry.provider.embed(texts);
      } catch (error) {
        lastError = error;
        const message = (error as { message?: string })?.message || 'unknown error';
        console.warn(`⚠️  ${entry.name} embedding failed: ${message}`);
      }
    }

    throw lastError ?? new Error('All AI providers failed for embeddings');
  }
}

function buildProviderChain(mode: string): NamedProvider[] {
  const openaiReady = hasUsableKey(process.env.OPENAI_API_KEY);
  const geminiReady = hasUsableKey(process.env.GEMINI_API_KEY);
  const ollamaEnabled = readBooleanEnv('OLLAMA_ENABLED', true) && !readBooleanEnv('OLLAMA_DISABLED', false);
  const ollamaConfigured = ollamaEnabled;
  const chain: NamedProvider[] = [];

  const addOllama = () => {
    chain.push({ name: 'Ollama', provider: new OllamaProvider() });
  };
  const addOpenAI = () => {
    if (openaiReady) chain.push({ name: 'OpenAI', provider: new OpenAIProvider() });
  };
  const addGemini = () => {
    if (geminiReady) chain.push({ name: 'Gemini', provider: new GeminiProvider() });
  };

  switch (mode) {
    case 'ollama':
    case 'local':
      addOllama();
      break;
    case 'openai':
      addOpenAI();
      addGemini();
      break;
    case 'gemini':
      addGemini();
      addOpenAI();
      break;
    case 'mock':
      break;
    case 'auto':
      if (ollamaConfigured) addOllama();
      if (openaiReady) addOpenAI();
      if (geminiReady) addGemini();
      break;
    default:
      console.warn(`⚠️  Unknown AI_PROVIDER "${mode}", using gemini`);
      addGemini();
      addOpenAI();
      break;
  }

  chain.push({ name: 'Mock', provider: new MockProvider() });
  return chain;
}

// -------------------------------------------
// Factory — returns configured provider
// -------------------------------------------
let _instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_instance) return _instance;

  const mode = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const chain = buildProviderChain(mode);
  console.log(`🤖 AI provider mode: ${mode} (fallback chain: ${chain.map((p) => p.name).join(' -> ')})`);

  _instance = new CompositeProvider(chain);
  return _instance;
}
