type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, remaining: 0 };
  return { ok: true, remaining: limit - b.count };
}

export function clientKey(req: Request, scope: string) {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const ip = fwd.split(',')[0].trim() || '0.0.0.0';
  return `${scope}:${ip}`;
}
