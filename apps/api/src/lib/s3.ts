import { AwsClient } from 'aws4fetch';

import { ErrorCodes } from '@otunlink/shared';

import type { Env } from '../types';

// OBS S3（OBS 兼容 AWS S3 API，经 aws4fetch 做 SigV4 签名）。
// 配置已落地于 wrangler.toml [vars] 与 .dev.vars（本地）/ wrangler secret（生产），
// 此文件只负责把 env 转成可用的 AwsClient 与对象 URL。

export const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

function createClient(env: Env): AwsClient {
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  const endpoint = env.S3_ENDPOINT;
  const region = env.S3_REGION;
  const bucket = env.S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !endpoint || !region || !bucket) {
    throw new Error(ErrorCodes.STORAGE_UNAVAILABLE);
  }
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: 's3',
  });
}

export function objectUrl(env: Env, key: string): string {
  const base = (env.S3_ENDPOINT ?? '').replace(/\/+$/, '');
  return `${base}/${env.S3_BUCKET}/${key}`;
}

export async function presignedGetUrl(env: Env, key: string): Promise<string> {
  const client = createClient(env);
  const request = await client.sign(new Request(objectUrl(env, key)), {
    aws: { signQuery: true },
    headers: { 'X-Amz-Expires': String(PRESIGNED_URL_TTL_SECONDS) },
  });
  return request.url;
}

export async function putObject(
  env: Env,
  key: string,
  body: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<void> {
  const client = createClient(env);
  const response = await client.fetch(objectUrl(env, key), {
    method: 'PUT',
    body: body as BodyInit,
    headers: { 'Content-Type': mime },
  });
  if (!response.ok) {
    throw new Error(ErrorCodes.STORAGE_UNAVAILABLE);
  }
}
