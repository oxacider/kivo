type RequestOptions = {
  token?: string;
  body?: unknown;
  method?: string;
};

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, body, method = body ? 'POST' : 'GET' } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data as T;
}