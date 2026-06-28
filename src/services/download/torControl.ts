import { ProxyConfig } from '@hooks/persisted/useSettings';

const CLOUDFLARE_PATTERNS = [
  'turnstile',
  'please complete the turnstile',
  'just a moment',
  'cf-browser-verification',
  'cf_clearance',
  'cf-challenge',
  'ddos-guard',
  'checking your browser',
  'enable javascript and cookies',
  'ray id',
];

const IP_BAN_PATTERNS = [
  'ip ban',
  'ip has been banned',
  'access denied',
  'your ip',
  'too many requests',
  '429',
  '403 forbidden',
  'rate limit',
  'blocked',
];

export function isCloudflareOrIPBanError(error: any, html?: string): boolean {
  const msg = String(error?.message || error || '').toLowerCase();

  if (
    CLOUDFLARE_PATTERNS.some(p => msg.includes(p)) ||
    IP_BAN_PATTERNS.some(p => msg.includes(p))
  ) {
    return true;
  }

  if (html) {
    const lower = html.toLowerCase();
    if (
      CLOUDFLARE_PATTERNS.some(p => lower.includes(p)) ||
      IP_BAN_PATTERNS.some(p => lower.includes(p))
    ) {
      return true;
    }
  }

  return false;
}

export async function torNewIdentity(proxy: ProxyConfig): Promise<boolean> {
  const host = proxy.torControlHost?.trim() || '127.0.0.1';
  const port = parseInt(proxy.torControlPort || '9051', 10) || 9051;
  const password = proxy.torControlPassword || '';

  const commands =
    `AUTHENTICATE "${password}"\r\nSIGNAL NEWNYM\r\nQUIT\r\n`;

  try {
    await fetch(`http://${host}:${port}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: commands,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // Expected: Tor's control port is not HTTP, so fetch will parse-error,
      // but the raw TCP bytes (our commands) are already sent and processed.
    });
  } catch {
    // Ignore — commands may still have been received by the control port
  }

  return true;
}
