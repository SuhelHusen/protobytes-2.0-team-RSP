"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Loader2,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import BottomToast from "@/components/ui/BottomToast";
import { Source, generateMindmap, getAllMindmaps, getSources } from "@/lib/api";
import { useTransientToast } from "@/lib/useTransientToast";

type MindMapNode = {
  id: string;
  label: string;
  description?: string;
  sourcePage?: number;
  children?: MindMapNode[];
};

type MindMapData = {
  title: string;
  summary?: string;
  rootNode: MindMapNode;
  sourcePages?: number[];
};

type FlatNode = {
  id: string;
  label: string;
  description?: string;
  sourcePage?: number;
  depth: number;
  parentId: string | null;
  childIds: string[];
};

type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "tree" | "related";
  reason?: string;
};

type NodePosition = {
  x: number;
  y: number;
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;
const MIN_CANVAS_WIDTH = 980;
const MIN_CANVAS_HEIGHT = 560;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "are",
  "was",
  "how",
  "why",
  "what",
  "when",
  "where",
  "their",
  "your",
  "using",
  "about",
]);

const fallbackMindMap: MindMapData = {
  title: "Cell Biology Revision",
  summary: "Quick visual structure for cell basics and their functions.",
  rootNode: {
    id: "root",
    label: "Cell Biology",
    description: "Core concepts for cell structure and function.",
    children: [
      {
        id: "n1",
        label: "Cell Membrane",
        description: "Controls exchange of materials.",
        sourcePage: 10,
        children: [
          {
            id: "n1-1",
            label: "Selective Permeability",
            description: "Allows only certain molecules.",
            sourcePage: 10,
            children: [],
          },
        ],
      },
      {
        id: "n2",
        label: "Organelles",
        description: "Specialized internal structures.",
        sourcePage: 11,
        children: [
          {
            id: "n2-1",
            label: "Mitochondria",
            description: "Energy production for the cell.",
            sourcePage: 11,
            children: [],
          },
          {
            id: "n2-2",
            label: "Nucleus",
            description: "Stores genetic material.",
            sourcePage: 11,
            children: [],
          },
        ],
      },
    ],
  },
  sourcePages: [10, 11],
};

function parseMindMap(raw: unknown): MindMapData | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as MindMapData;
      if (parsed?.rootNode) return parsed;
      return null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && (raw as { rootNode?: unknown }).rootNode) {
    return raw as MindMapData;
  }
  return null;
}

function normalizeNode(node: MindMapNode, fallbackId: string, seen: Set<string>): MindMapNode {
  const baseId = (node.id || fallbackId).trim() || fallbackId;
  let uniqueId = baseId;
  let duplicateCounter = 1;
  while (seen.has(uniqueId)) {
    uniqueId = `${baseId}-${duplicateCounter}`;
    duplicateCounter += 1;
  }
  seen.add(uniqueId);

  const rawChildren = Array.isArray(node.children) ? node.children : [];
  const children = rawChildren.map((child, index) =>
    normalizeNode(child, `${uniqueId}-${index + 1}`, seen)
  );

  return {
    ...node,
    id: uniqueId,
    children,
  };
}

function normalizeMindMap(mindmap: MindMapData): MindMapData {
  const rootNode = normalizeNode(mindmap.rootNode, "root", new Set<string>());
  return {
    ...mindmap,
    rootNode,
  };
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildRelatedEdgeId(
  prefix: "page" | "keyword",
  sourceId: string,
  targetId: string,
  page?: number
): string {
  const [first, second] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
  const pagePart = typeof page === "number" ? `${page}:` : "";
  return `${prefix}:${pagePart}${encodeURIComponent(first)}=>${encodeURIComponent(second)}`;
}

function flattenMindMap(root: MindMapNode): { nodes: FlatNode[]; treeEdges: GraphEdge[] } {
  const nodes: FlatNode[] = [];
  const treeEdges: GraphEdge[] = [];

  const visit = (node: MindMapNode, depth: number, parentId: string | null) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const childIds = children.map((child) => child.id);

    nodes.push({
      id: node.id,
      label: node.label,
      description: node.description,
      sourcePage: node.sourcePage,
      depth,
      parentId,
      childIds,
    });

    children.forEach((child) => {
      treeEdges.push({
        id: `${node.id}->${child.id}`,
        sourceId: node.id,
        targetId: child.id,
        kind: "tree",
      });
      visit(child, depth + 1, node.id);
    });
  };

  visit(root, 0, null);
  return { nodes, treeEdges };
}

function tokenizeLabel(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function buildRelatedEdges(nodes: FlatNode[], treeEdges: GraphEdge[]): GraphEdge[] {
  const relatedEdges: GraphEdge[] = [];
  const usedKeys = new Set<string>(treeEdges.map((edge) => edgeKey(edge.sourceId, edge.targetId)));
  const perNodeCount = new Map<string, number>();

  const canConnect = (a: FlatNode, b: FlatNode) => {
    if (a.id === b.id) return false;
    const key = edgeKey(a.id, b.id);
    if (usedKeys.has(key)) return false;
    if ((perNodeCount.get(a.id) || 0) >= 3 || (perNodeCount.get(b.id) || 0) >= 3) return false;
    usedKeys.add(key);
    perNodeCount.set(a.id, (perNodeCount.get(a.id) || 0) + 1);
    perNodeCount.set(b.id, (perNodeCount.get(b.id) || 0) + 1);
    return true;
  };

  const pageBuckets = new Map<number, FlatNode[]>();
  nodes.forEach((node) => {
    if (typeof node.sourcePage !== "number") return;
    const bucket = pageBuckets.get(node.sourcePage) || [];
    bucket.push(node);
    pageBuckets.set(node.sourcePage, bucket);
  });

  pageBuckets.forEach((bucket, page) => {
    const capped = bucket.slice(0, 8);
    for (let i = 0; i < capped.length; i += 1) {
      for (let j = i + 1; j < capped.length; j += 1) {
        if (!canConnect(capped[i], capped[j])) continue;
        relatedEdges.push({
          id: buildRelatedEdgeId("page", capped[i].id, capped[j].id, page),
          sourceId: capped[i].id,
          targetId: capped[j].id,
          kind: "related",
          reason: `Same page ${page}`,
        });
      }
    }
  });

  const tokenized = nodes.map((node) => ({
    node,
    tokens: new Set(tokenizeLabel(node.label)),
  }));

  for (let i = 0; i < tokenized.length; i += 1) {
    for (let j = i + 1; j < tokenized.length; j += 1) {
      if (relatedEdges.length >= 20) return relatedEdges;
      const left = tokenized[i];
      const right = tokenized[j];
      if (Math.abs(left.node.depth - right.node.depth) > 2) continue;
      const overlap = [...left.tokens].filter((token) => right.tokens.has(token));
      if (overlap.length === 0) continue;
      if (!canConnect(left.node, right.node)) continue;
      relatedEdges.push({
        id: buildRelatedEdgeId("keyword", left.node.id, right.node.id),
        sourceId: left.node.id,
        targetId: right.node.id,
        kind: "related",
        reason: `Shared topic: ${overlap.slice(0, 2).join(", ")}`,
      });
    }
  }

  return relatedEdges;
}

function buildInitialPositions(nodes: FlatNode[]): Record<string, NodePosition> {
  const groups = new Map<number, FlatNode[]>();
  nodes.forEach((node) => {
    const group = groups.get(node.depth) || [];
    group.push(node);
    groups.set(node.depth, group);
  });

  const maxRows = Math.max(1, ...[...groups.values()].map((group) => group.length));
  const xGap = 290;
  const yGap = 136;
  const leftPadding = 70;
  const topPadding = 70;
  const positions: Record<string, NodePosition> = {};

  [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([depth, group]) => {
      const sorted = [...group].sort((left, right) => left.label.localeCompare(right.label));
      const offsetRows = (maxRows - sorted.length) / 2;
      sorted.forEach((node, index) => {
        positions[node.id] = {
          x: leftPadding + depth * xGap,
          y: topPadding + (offsetRows + index) * yGap,
        };
      });
    });

  return positions;
}

function computeCanvasSize(positions: Record<string, NodePosition>): { width: number; height: number } {
  const coords = Object.values(positions);
  if (coords.length === 0) {
    return { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT };
  }

  const maxX = Math.max(...coords.map((pos) => pos.x)) + NODE_WIDTH + 80;
  const maxY = Math.max(...coords.map((pos) => pos.y)) + NODE_HEIGHT + 80;

  return {
    width: Math.max(MIN_CANVAS_WIDTH, Math.ceil(maxX)),
    height: Math.max(MIN_CANVAS_HEIGHT, Math.ceil(maxY)),
  };
}

export default function MindMapPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [topic, setTopic] = useState("");
  const [mindmap, setMindmap] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [showRelatedEdges, setShowRelatedEdges] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast, showToast } = useTransientToast();

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await getSources();
      if (!active) return;
      if (response.data?.sources) {
        setSources(response.data.sources);
        if (response.data.sources[0]) {
          setSelectedSource(response.data.sources[0].id);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (isExpanded) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isExpanded]);

  const normalizedMindmap = useMemo(() => {
    if (!mindmap?.rootNode) return null;
    return normalizeMindMap(mindmap);
  }, [mindmap]);

  const graph = useMemo(() => {
    if (!normalizedMindmap?.rootNode) return null;
    const { nodes, treeEdges } = flattenMindMap(normalizedMindmap.rootNode);
    const relatedEdges = buildRelatedEdges(nodes, treeEdges);
    return {
      nodes,
      treeEdges,
      relatedEdges,
      edges: [...treeEdges, ...relatedEdges],
    };
  }, [normalizedMindmap]);

  useEffect(() => {
    if (!graph?.nodes.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPositions({});
      setActiveNodeId(null);
      return;
    }
    setPositions(buildInitialPositions(graph.nodes));
    setActiveNodeId(graph.nodes[0]?.id || null);
  }, [graph]);

  const canvasSize = useMemo(() => computeCanvasSize(positions), [positions]);

  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const nextX = event.clientX - canvasRect.left - dragging.offsetX;
      const nextY = event.clientY - canvasRect.top - dragging.offsetY;
      const boundedX = Math.max(12, Math.min(nextX, canvasSize.width - NODE_WIDTH - 12));
      const boundedY = Math.max(12, Math.min(nextY, canvasSize.height - NODE_HEIGHT - 12));

      setPositions((current) => ({
        ...current,
        [dragging.nodeId]: { x: boundedX, y: boundedY },
      }));
    };

    const onPointerUp = () => {
      setDragging(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragging, canvasSize.height, canvasSize.width]);

  const visibleEdges = useMemo(() => {
    if (!graph) return [];
    return showRelatedEdges ? graph.edges : graph.treeEdges;
  }, [graph, showRelatedEdges]);

  const activeNode = useMemo(() => {
    if (!graph?.nodes.length || !activeNodeId) return null;
    return graph.nodes.find((node) => node.id === activeNodeId) || null;
  }, [activeNodeId, graph]);

  const connectedIds = useMemo(() => {
    const linked = new Set<string>();
    if (!activeNodeId) return linked;
    visibleEdges.forEach((edge) => {
      if (edge.sourceId === activeNodeId) linked.add(edge.targetId);
      if (edge.targetId === activeNodeId) linked.add(edge.sourceId);
    });
    return linked;
  }, [activeNodeId, visibleEdges]);

  const selectedSourceName = useMemo(() => {
    return sources.find((source) => source.id === selectedSource)?.file_name || "No source selected";
  }, [selectedSource, sources]);

  async function loadLatestSet() {
    setLoadingPrevious(true);

    const response = await getAllMindmaps();
    setLoadingPrevious(false);

    const firstSet = response.data?.mindmaps?.[0] as { mindmap?: unknown } | undefined;
    const parsed = parseMindMap(firstSet?.mindmap);
    if (parsed) {
      setMindmap(parsed);
      showToast("Loaded latest mind map.", "info");
      return;
    }

    if (response.error) {
      showToast(response.error, "error");
      return;
    }

    showToast("No previous mind map found.", "info");
  }

  async function generate() {
    if (!selectedSource) {
      showToast("Select a source first.", "error");
      return;
    }

    setLoading(true);

    const response = await generateMindmap({
      sourceId: selectedSource,
      topic: topic.trim() || undefined,
    });
    setLoading(false);

    const payload = response.data as { mindmap?: MindMapData } | undefined;
    if (payload?.mindmap?.rootNode) {
      setMindmap(payload.mindmap);
      return;
    }

    if (response.error) {
      setMindmap(fallbackMindMap);
      showToast(`${response.error}. Showing sample mind map.`, "error");
    }
  }

  const renderGraphCanvas = (expanded: boolean) => (
    <div className="rounded-2xl border border-[var(--line)] bg-[#f7faff] p-2">
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/40 p-2">
        <div
          className={`overflow-auto rounded-lg border border-[var(--line)] bg-[#f9fbff] ${
            expanded ? "h-[calc(100vh-240px)]" : "h-[clamp(420px,62vh,760px)]"
          }`}
        >
          <div
            ref={canvasRef}
            className="relative"
            style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
          >
            <svg
              width={canvasSize.width}
              height={canvasSize.height}
              className="absolute left-0 top-0 h-full w-full"
            >
              {visibleEdges.map((edge) => {
                const source = positions[edge.sourceId];
                const target = positions[edge.targetId];
                if (!source || !target) return null;

                const sourceX = source.x + NODE_WIDTH / 2;
                const sourceY = source.y + NODE_HEIGHT / 2;
                const targetX = target.x + NODE_WIDTH / 2;
                const targetY = target.y + NODE_HEIGHT / 2;
                const curveOffset = Math.max(40, Math.abs(targetX - sourceX) / 2.4);
                const activeEdge =
                  activeNodeId &&
                  (edge.sourceId === activeNodeId || edge.targetId === activeNodeId);

                return (
                  <path
                    key={edge.id}
                    d={`M ${sourceX} ${sourceY} C ${sourceX + curveOffset} ${sourceY}, ${targetX - curveOffset} ${targetY}, ${targetX} ${targetY}`}
                    fill="none"
                    stroke={
                      edge.kind === "tree"
                        ? activeEdge
                          ? "var(--primary)"
                          : "var(--line-strong)"
                        : activeEdge
                          ? "#3c6ec9"
                          : "#9bb1d4"
                    }
                    strokeWidth={edge.kind === "tree" ? (activeEdge ? 2.2 : 1.6) : 1.5}
                    strokeDasharray={edge.kind === "related" ? "7 6" : undefined}
                    opacity={activeEdge ? 1 : 0.76}
                  />
                );
              })}
            </svg>

            {graph?.nodes.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;
              const selected = activeNodeId === node.id;
              const connected = connectedIds.has(node.id);

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setActiveNodeId(node.id)}
                  onPointerDown={(event) => {
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setActiveNodeId(node.id);
                    setDragging({
                      nodeId: node.id,
                      offsetX: event.clientX - rect.left - pos.x,
                      offsetY: event.clientY - rect.top - pos.y,
                    });
                  }}
                  className={`absolute rounded-xl border px-3 py-2 text-left shadow-[0_8px_18px_rgba(24,42,62,0.14)] transition ${
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : connected
                        ? "border-[#b8caea] bg-[#f1f5ff]"
                        : "border-[var(--line)] bg-white"
                  }`}
                  style={{
                    width: `${NODE_WIDTH}px`,
                    minHeight: `${NODE_HEIGHT}px`,
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    touchAction: "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">{node.label}</p>
                    <Move size={12} className="mt-0.5 shrink-0 text-[var(--ink-soft)]" />
                  </div>
                  {node.description ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--ink-soft)]">
                      {node.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    {node.sourcePage ? (
                      <span className="rounded-full bg-[#e8f1ff] px-2 py-0.5 font-semibold text-[#2d43cc]">
                        Page {node.sourcePage}
                      </span>
                    ) : (
                      <span className="text-[var(--ink-soft)]">No page</span>
                    )}
                    <span className="text-[var(--ink-soft)]">{node.childIds.length} branches</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      title="Mind Map Builder"
      sidebarContent={(
        <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_10px_24px_rgba(22,38,52,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-soft)]">
            Graph Details
          </p>

          <div className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] p-2.5">
            <p className="text-[11px] text-[var(--ink-soft)]">Current source</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-[var(--ink)]">{selectedSourceName}</p>
          </div>

          {activeNode ? (
            <div className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-3">
              <p className="text-sm font-semibold text-[var(--ink)]">{activeNode.label}</p>
              {activeNode.description ? (
                <p className="text-xs leading-relaxed text-[var(--ink-soft)]">{activeNode.description}</p>
              ) : (
                <p className="text-xs text-[var(--ink-soft)]">No description provided for this node.</p>
              )}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 font-semibold text-[var(--primary)]">
                  Depth {activeNode.depth}
                </span>
                {activeNode.sourcePage ? (
                  <span className="rounded-full bg-[#edf4ff] px-2 py-0.5 font-semibold text-[#2d43cc]">
                    Page {activeNode.sourcePage}
                  </span>
                ) : null}
                <span className="rounded-full bg-[#edf2f7] px-2 py-0.5 font-semibold text-[var(--ink-soft)]">
                  {connectedIds.size} linked nodes
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-2 text-xs text-[var(--ink-soft)]">
              Select a node to inspect connections.
            </p>
          )}

          <div className="rounded-xl border border-[var(--line)] bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-[var(--ink)]">Connection Legend</p>
            <div className="space-y-1.5 text-[11px] text-[var(--ink-soft)]">
              <p>
                <span className="font-semibold text-[var(--ink)]">Solid line:</span> parent-child topic flow
              </p>
              <p>
                <span className="font-semibold text-[var(--ink)]">Dashed line:</span> related topic similarity
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            disabled={!graph}
            className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] disabled:opacity-50"
          >
            <Maximize2 size={12} />
            Open Full Mind Map
          </button>
        </section>
      )}
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(20,38,52,0.07)]">
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto_auto]">
            <select
              value={selectedSource}
              onChange={(event) => setSelectedSource(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">Select source...</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.file_name}
                </option>
              ))}
            </select>

            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic focus (optional)"
              className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />

            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate
            </button>

            <button
              type="button"
              onClick={() => void loadLatestSet()}
              disabled={loadingPrevious}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--ink-soft)]"
            >
              {loadingPrevious ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Load Latest
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_12px_28px_rgba(20,38,52,0.08)]">
          {mindmap?.rootNode && graph ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{mindmap.title || "Mind Map"}</h3>
                  {mindmap.summary ? (
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">{mindmap.summary}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                    <Brain size={13} />
                    Interactive Graph
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRelatedEdges((value) => !value)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      showRelatedEdges
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--line)] bg-white text-[var(--ink-soft)]"
                    }`}
                  >
                    {showRelatedEdges ? "Related Links On" : "Related Links Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPositions(buildInitialPositions(graph.nodes));
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]"
                  >
                    <RotateCcw size={12} />
                    Reset Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]"
                  >
                    <Maximize2 size={12} />
                    Full Open
                  </button>
                </div>
              </div>

              {renderGraphCanvas(false)}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--card)] p-10 text-center text-sm text-[var(--ink-soft)]">
              Generate a mind map from a selected source to begin.
            </div>
          )}
        </section>
      </div>

      {isExpanded && graph ? (
        <>
          <div
            className="fixed inset-0 z-[100] bg-[rgba(8,20,38,0.45)] backdrop-blur-sm"
            onClick={() => setIsExpanded(false)}
          />
          <section className="fixed inset-4 z-[110] flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_24px_60px_rgba(9,22,39,0.4)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--card)] px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-soft)]">Mind Map Full View</p>
                <p className="text-sm font-semibold text-[var(--ink)]">{mindmap?.title || "Mind Map"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRelatedEdges((value) => !value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    showRelatedEdges
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--line)] bg-white text-[var(--ink-soft)]"
                  }`}
                >
                  {showRelatedEdges ? "Related Links On" : "Related Links Off"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPositions(buildInitialPositions(graph.nodes));
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]"
                >
                  <RotateCcw size={12} />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-soft)]"
                >
                  <Minimize2 size={12} />
                  Exit Full
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--ink-soft)]"
                  aria-label="Close full map"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3">{renderGraphCanvas(true)}</div>
          </section>
        </>
      ) : null}

      <BottomToast toast={toast} />
    </AppShell>
  );
}
