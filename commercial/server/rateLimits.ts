import type { Request, Response } from 'express';
import { isIP } from 'node:net';
import { HttpError } from './domain';

const minute = 60_000;
export const categoryWindow = 5 * minute;
export const categoryQuota = 6;

export class RateLimitError extends HttpError {
  constructor(readonly retryAfter: number, message = 'الطلبات كثيرة. انتظر شوي وحاول مجددًا.') {
    super(429, message);
  }
}

export function retryAfter(expiresAt: number, now: number) {
  return Math.max(1, Math.ceil((expiresAt - now) / 1000));
}

type Limit = { group: string; max: number; window: number };
const limit = (group: string, max: number, minutes = 1): Limit => ({ group, max, window: minutes * minute });

function operation(req: Request) {
  const path = (req.baseUrl + req.path).toLowerCase().replace(/\/$/, '');
  if (req.method !== 'POST') return undefined;
  if (path === '/api/sessions') return 'create-session';
  if (path === '/api/invitations/accept' || /^\/api\/sessions\/[^/]+\/invite$/.test(path)) return 'invite';
  return undefined;
}

export function createRateLimits(now = Date.now, cloudflareTunnel = false) {
  const counters = new Map<string, { count: number; expiresAt: number }>();
  const capacity = 20_000;
  let nextCleanup = 0;

  function check(key: string, limits: Limit[]) {
    const time = now();
    if (time >= nextCleanup) {
      for (const [id, entry] of counters) if (entry.expiresAt <= time) counters.delete(id);
      nextCleanup = time + minute;
    }

    for (const rule of limits) {
      const id = `${rule.group}:${key}`;
      const current = counters.get(id);
      if (current && current.expiresAt > time) {
        if (current.count >= rule.max) throw new RateLimitError(retryAfter(current.expiresAt, time));
        current.count++;
      } else {
        if (!current && counters.size >= capacity) throw new RateLimitError(retryAfter(nextCleanup, time));
        counters.set(id, { count: 1, expiresAt: time + rule.window });
      }
    }
  }

  function byIp(req: Request, _res: Response, next: () => void) {
    // This middleware is mounted at /api, so req.path starts after that prefix.
    const path = req.path.toLowerCase();
    const limits = [limit('ip', 360)];
    if (/^\/dev\/(sign-in|password)\/?$/.test(path)) limits.push(limit('ip:demo-auth', 20));
    if (/^\/locations\/cities\/?$/.test(path)) limits.push(limit('ip:city-search', 90));
    const action = operation(req);
    if (action === 'create-session') limits.push(limit('ip:session', 30, 10));
    if (action === 'invite') limits.push(limit('ip:invite', 45, 10));
    const peer = req.socket.remoteAddress;
    const localProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
    const forwarded = cloudflareTunnel && localProxy ? req.get('CF-Connecting-IP') : undefined;
    check(forwarded && isIP(forwarded) ? forwarded : peer ?? 'unknown', limits);
    next();
  }

  function byAccount(req: Request, accountId: string) {
    const limits = [limit('account', 90)];
    if (!['GET', 'HEAD'].includes(req.method)) limits.push(limit('account:write', 35));
    const action = operation(req);
    if (action === 'create-session') limits.push(limit('account:session', 5, 10));
    if (action === 'invite') limits.push(limit('account:invite', 8, 10));
    check(accountId, limits);
  }

  return { byIp, byAccount };
}
