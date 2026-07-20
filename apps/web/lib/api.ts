const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Set by LocationLayout to the URL's [locationId] whenever a location-scoped
// page is mounted. Sent as X-Location-Id on every request so org_owner can
// drill into a location other than the one baked into their login cookie —
// see rls-transaction.middleware.ts, which is the only place that trusts it.
let activeLocationId: string | null = null;
export function setActiveLocationId(id: string | null) {
  activeLocationId = id;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(typeof body?.message === 'string' ? body.message : `API error ${status}`);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(activeLocationId ? { 'X-Location-Id': activeLocationId } : {}),
      ...options.headers,
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { API_URL };
