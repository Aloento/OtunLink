// 文件仓库（files + item_images 引用）。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateFileInput, FileRecord, FileRepository } from '../../types';
import { quote } from './helpers';
import { mapFile } from './mappers';

export function createFilesRepo(exec: SqlExecutor): FileRepository {
  const files: FileRepository = {
    async findById(id: string): Promise<FileRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM files WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapFile(rows[0]) : null;
    },
    async create(input: CreateFileInput): Promise<FileRecord> {
      const { rows } = await exec.query(
        `INSERT INTO files (key, thumbnail_key, mime, size, width, height)
         VALUES (${quote(input.key)}, ${quote(input.thumbnailKey)}, ${quote(input.mime)},
                 ${quote(input.size)}, ${quote(input.width)}, ${quote(input.height)})
         RETURNING *`,
      );
      return mapFile(rows[0]);
    },
    async deleteIfUnreferenced(id: string): Promise<FileRecord | null> {
      const { rows } = await exec.query(
        `DELETE FROM files
         WHERE id = ${quote(id)}
           AND NOT EXISTS (SELECT 1 FROM item_images WHERE file_id = ${quote(id)})
           AND NOT EXISTS (SELECT 1 FROM payments WHERE proof_file_id = ${quote(id)})
           AND NOT EXISTS (SELECT 1 FROM discrepancy_reviews WHERE ${quote(id)} = ANY(photo_file_ids))
           AND NOT EXISTS (SELECT 1 FROM inbound_orders WHERE ${quote(id)} = ANY(photo_file_ids))
           AND NOT EXISTS (SELECT 1 FROM outbound_orders WHERE ${quote(id)} = ANY(photo_file_ids))
           AND NOT EXISTS (SELECT 1 FROM return_orders WHERE ${quote(id)} = ANY(photo_file_ids))
         RETURNING *`,
      );
      return rows[0] ? mapFile(rows[0]) : null;
    },
  };

  return files;
}
