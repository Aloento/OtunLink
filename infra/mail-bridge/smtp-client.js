import net from 'node:net';
import tls from 'node:tls';

/**
 * Minimal SMTP client (zero npm dependencies).
 * Supports:
 *  - plain connection on port 25 (non-TLS)
 *  - implicit TLS on port 465 (secure)
 *  - explicitly STARTTLS is NOT implemented; production should use
 *    port 465 or a trusted internal relay on port 25.
 *  - AUTH LOGIN / AUTH PLAIN (CRAM-MD5 not supported).
 */
export async function sendMailViaSmtp(config, message) {
  const { host, port, secure = false, user, pass } = config;
  if (!host || !port) throw new Error('SMTP_HOST / SMTP_PORT are required');

  const socket = await connectSocket(host, port, secure);
  try {
    const greeting = await readReply(socket);
    if (greeting.code !== 220) throw new Error(`SMTP greeting failed (${greeting.code})`);

    await writeLine(socket, 'EHLO otunlink-bridge');
    const ehlo = await readReply(socket);
    if (ehlo.code !== 250) throw new Error(`EHLO failed (${ehlo.code})`);
    const caps = ehlo.lines.join('\n').toUpperCase();

    if (user && pass) {
      if (caps.includes('AUTH PLAIN')) {
        const token = Buffer.from(`\0${user}\0${pass}`).toString('base64');
        await writeLine(socket, `AUTH PLAIN ${token}`);
      } else {
        await writeLine(socket, 'AUTH LOGIN');
        await expectCode(socket, 334);
        await writeLine(socket, Buffer.from(user).toString('base64'));
        await expectCode(socket, 334);
        await writeLine(socket, Buffer.from(pass).toString('base64'));
      }
      const auth = await readReply(socket);
      if (auth.code !== 235) throw new Error(`AUTH failed (${auth.code})`);
    }

    await writeLine(socket, `MAIL FROM:<${config.from}>`);
    await expectCode(socket, 250);
    await writeLine(socket, `RCPT TO:<${message.to}>`);
    await expectCode(socket, 250, 251);
    await writeLine(socket, 'DATA');
    await expectCode(socket, 354);

    const header = [
      `From: ${config.fromName ? `${config.fromName} <${config.from}>` : config.from}`,
      `To: ${message.to}`,
      `Subject: ${sanitizeHeader(message.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      `Date: ${new Date().toUTCString()}`,
      '',
    ].join('\r\n');
    const body = `${message.text ?? ''}`.replace(/\r?\n/g, '\r\n');
    await writeLine(socket, `${header}${body}\r\n.`);
    const sent = await readReply(socket);
    if (sent.code !== 250) throw new Error(`DATA failed (${sent.code})`);

    await writeLine(socket, 'QUIT');
    await readReply(socket);
    return { accepted: true };
  } finally {
    socket.destroy();
  }
}

function connectSocket(host, port, secure) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    socket.setTimeout(15000, () => {
      socket.destroy(new Error('SMTP connection timed out'));
    });
    const onReady = () => {
      socket.off('error', onError);
      resolve(socket);
    };
    const onError = (err) => {
      socket.off('ready', onReady);
      reject(err);
    };
    socket.once(secure ? 'secureConnect' : 'connect', onReady);
    socket.once('error', onError);
  });
}

function writeLine(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\r\n`, (err) => (err ? reject(err) : resolve()));
  });
}

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.includes('\r\n')) return;
      socket.off('data', onData);
      const lines = buffer.trim().split('\r\n');
      const code = Number(lines[0].slice(0, 3));
      resolve({ code, lines });
    };
    socket.on('data', onData);
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('SMTP connection closed')));
  });
}

function expectCode(socket, ...codes) {
  return readReply(socket).then((reply) => {
    if (!codes.includes(reply.code)) throw new Error(`Unexpected SMTP reply (${reply.code})`);
    return reply;
  });
}

function sanitizeHeader(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}
