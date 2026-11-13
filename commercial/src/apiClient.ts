export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly retryAt = 0) { super(message); }
}

const waiting = new Map<string, ApiError>();

export async function request<T>(path: string, token: string | null, method = 'GET', body?: unknown): Promise<T> {
  const time = Date.now();
  for (const [key, error] of waiting) if (error.retryAt <= time) waiting.delete(key);
  const key = `${method} ${path}`;
  const paused = waiting.get(key);
  if (paused) throw paused;

  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const json = response.headers.get('content-type')?.includes('application/json');
  if (response.status === 429) {
    const raw = response.headers.get('Retry-After') ?? '';
    const now = Date.now();
    const delay = /^\d{1,8}$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - now;
    const seconds = Math.max(1, Math.ceil((Number.isFinite(delay) ? delay : 15_000) / 1000));
    const result = json ? await response.json().catch(() => null) : null;
    const message = typeof result?.error === 'string' ? result.error : 'الطلبات كثيرة. حاول مجددًا بعد قليل.';
    const error = new ApiError(429, `${message} وقت الانتظار ${seconds} ثانية.`, now + seconds * 1000);
    waiting.set(key, error);
    throw error;
  }
  if (!json) throw new ApiError(response.status, 'تعذّر قراءة ردّ خادم مَوَدّة. تحقّق من عنوان الخادم وحاول مجددًا.');
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result.error || 'تعذّر إكمال الطلب.');
  return result as T;
}
