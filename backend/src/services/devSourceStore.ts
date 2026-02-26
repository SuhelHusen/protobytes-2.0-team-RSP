interface DevSourceRecord {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  totalPages: number;
  createdAt: string;
}

const sourceById = new Map<string, DevSourceRecord>();

export interface DevSourceItem {
  id: string;
  file_name: string;
  file_path: string;
  total_pages: number;
  created_at: string;
}

export function upsertDevSource(input: {
  id: string;
  userId: string;
  fileName: string;
  filePath: string;
  totalPages: number;
}): DevSourceItem {
  const existing = sourceById.get(input.id);
  const next: DevSourceRecord = {
    id: input.id,
    userId: input.userId,
    fileName: input.fileName,
    filePath: input.filePath,
    totalPages: input.totalPages,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  sourceById.set(input.id, next);

  return {
    id: next.id,
    file_name: next.fileName,
    file_path: next.filePath,
    total_pages: next.totalPages,
    created_at: next.createdAt,
  };
}

export function listDevSources(userId: string): DevSourceItem[] {
  return [...sourceById.values()]
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({
      id: item.id,
      file_name: item.fileName,
      file_path: item.filePath,
      total_pages: item.totalPages,
      created_at: item.createdAt,
    }));
}

export function deleteDevSource(id: string, userId: string): DevSourceItem | null {
  const existing = sourceById.get(id);
  if (!existing || existing.userId !== userId) return null;
  sourceById.delete(id);
  return {
    id: existing.id,
    file_name: existing.fileName,
    file_path: existing.filePath,
    total_pages: existing.totalPages,
    created_at: existing.createdAt,
  };
}

export function getDevSource(id: string, userId: string): DevSourceItem | null {
  const item = sourceById.get(id);
  if (!item || item.userId !== userId) return null;
  return {
    id: item.id,
    file_name: item.fileName,
    file_path: item.filePath,
    total_pages: item.totalPages,
    created_at: item.createdAt,
  };
}
