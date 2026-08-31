// 常量时间字符串比较：先对双方做 SHA-256 摘要（长度固定），再逐字节 XOR，
// 避免直接使用 === 导致基于时序的密钥猜测。兼容 Worker 与 Node 的 Web Crypto。
export async function secureEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  if (ua.length !== ub.length) return false;

  let diff = 0;
  for (let i = 0; i < ua.length; i += 1) {
    diff |= ua[i] ^ ub[i];
  }
  return diff === 0;
}
