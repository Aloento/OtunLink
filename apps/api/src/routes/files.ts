import { ErrorCodes, Permissions } from '@otunlink/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { requirePermission } from '../auth/middleware';
import { fileDto } from '../lib/dto';
import { dbUnavailable, error, notFound, ok, validationError } from '../lib/http';
import { sniffImage, type SniffedImage } from '../lib/image';
import { presignedGetUrl, putObject } from '../lib/s3';
import type { AppEnv } from '../types';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const MIME_EXT: Record<SniffedImage['mime'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface FilesDeps {
  putObject?: (env: AppEnv['Bindings'], key: string, body: Uint8Array, mime: string) => Promise<void>;
  presignedGetUrl?: (env: AppEnv['Bindings'], key: string) => Promise<string>;
  randomUUID?: () => string;
}

// 图片上传与预签名 URL（design.md §8.1 图片管线）。
// POST /files 为 multipart：`image`（必填，压缩后的展示图）+ `thumb`（可选，320px 缩略图）。
// 后端仅校验魔数（JPEG/PNG/WebP）、decoded 尺寸与大小（≤5MB），压缩在浏览器完成。
export function filesRouter(deps: FilesDeps = {}): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const upload = deps.putObject ?? putObject;
  const presign = deps.presignedGetUrl ?? presignedGetUrl;
  const uuid = deps.randomUUID ?? (() => crypto.randomUUID());

  router.post('/', requirePermission(Permissions.ITEMS_WRITE), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return validationError(c, '请求体不是合法的 multipart/form-data');
    }

    const imagePart = form.get('image');
    if (!(imagePart instanceof File)) {
      return validationError(c, '缺少图片字段 image');
    }

    const imageBytes = new Uint8Array(await imagePart.arrayBuffer());
    if (imageBytes.length > MAX_FILE_BYTES) {
      return error(c, 413, ErrorCodes.FILE_TOO_LARGE, '图片超过 5MB 限制');
    }
    const imageInfo = sniffImage(imageBytes);
    if (!imageInfo) {
      return error(c, 400, ErrorCodes.FILE_INVALID, '仅支持 JPEG/PNG/WebP 图片');
    }

    let thumbBytes: Uint8Array | null = null;
    let thumbInfo: SniffedImage | null = null;
    const thumbPart = form.get('thumb');
    if (thumbPart instanceof File && thumbPart.size > 0) {
      thumbBytes = new Uint8Array(await thumbPart.arrayBuffer());
      if (thumbBytes.length > MAX_FILE_BYTES) {
        return error(c, 413, ErrorCodes.FILE_TOO_LARGE, '缩略图超过 5MB 限制');
      }
      thumbInfo = sniffImage(thumbBytes);
      if (!thumbInfo) {
        return error(c, 400, ErrorCodes.FILE_INVALID, '缩略图仅支持 JPEG/PNG/WebP');
      }
    }

    const base = `items/${uuid()}`;
    const key = `${base}.${MIME_EXT[imageInfo.mime]}`;
    const thumbnailKey = thumbInfo ? `${base}_thumb.${MIME_EXT[thumbInfo.mime]}` : null;

    try {
      await upload(c.env, key, imageBytes, imageInfo.mime);
      if (thumbBytes && thumbInfo && thumbnailKey) {
        await upload(c.env, thumbnailKey, thumbBytes, thumbInfo.mime);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message === ErrorCodes.STORAGE_UNAVAILABLE) {
        return error(c, 503, ErrorCodes.STORAGE_UNAVAILABLE, '对象存储不可用');
      }
      throw cause;
    }

    const record = await repos.files.create({
      key,
      thumbnailKey,
      mime: imageInfo.mime,
      size: imageBytes.length,
      width: imageInfo.width,
      height: imageInfo.height,
    });

    return ok(c, fileDto(record), 201);
  });

  router.get('/:id/url', requirePermission(Permissions.ITEMS_READ), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const record = await repos.files.findById(c.req.param('id'));
    if (!record) return notFound(c, '文件不存在');

    try {
      const url = await presign(c.env, record.key);
      const thumbnailUrl = record.thumbnailKey ? await presign(c.env, record.thumbnailKey) : null;
      return ok(c, {
        url,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        expiresInSeconds: 15 * 60,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message === ErrorCodes.STORAGE_UNAVAILABLE) {
        return error(c, 503, ErrorCodes.STORAGE_UNAVAILABLE, '对象存储不可用');
      }
      throw cause;
    }
  });

  return router;
}
