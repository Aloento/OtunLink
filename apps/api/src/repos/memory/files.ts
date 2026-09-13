// 文件内存仓库（files）。
import type { CreateFileInput, FileRecord, FileRepository } from '../../types';
import { uuid } from './helpers';

export class MemoryFileRepository implements FileRepository {
  private rows = new Map<string, FileRecord>();

  constructor(seed: FileRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneFile(row));
  }

  async findById(id: string): Promise<FileRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneFile(row) : null;
  }

  async create(input: CreateFileInput): Promise<FileRecord> {
    const row: FileRecord = {
      id: uuid(),
      key: input.key,
      thumbnailKey: input.thumbnailKey,
      mime: input.mime,
      size: input.size,
      width: input.width,
      height: input.height,
      createdAt: new Date(),
    };
    this.rows.set(row.id, cloneFile(row));
    return cloneFile(row);
  }

  async deleteIfUnreferenced(id: string): Promise<FileRecord | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    this.rows.delete(id);
    return cloneFile(row);
  }
}

export function cloneFile(row: FileRecord): FileRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}
