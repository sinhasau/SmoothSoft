import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setActiveLocationId } from './api';

describe('api client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setActiveLocationId(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends GET requests with credentials and JSON content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as any;

    const result = await api.get<{ ok: boolean }>('/queue');

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/queue');
    expect(init.credentials).toBe('include');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Location-Id']).toBeUndefined();
  });

  it('attaches X-Location-Id once set via setActiveLocationId', async () => {
    setActiveLocationId('loc_42');
    const fetchMock = vi.fn().mockResolvedValue(new Response('null', { status: 200 }));
    global.fetch = fetchMock as any;

    await api.get('/queue');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Location-Id']).toBe('loc_42');
  });

  it('throws ApiError with status and parsed body on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Not allowed' }), { status: 403 }));
    global.fetch = fetchMock as any;

    await expect(api.get('/queue')).rejects.toMatchObject({
      status: 403,
      body: { message: 'Not allowed' },
    });
  });

  it('derives ApiError.message from the body message when present', async () => {
    const err = new ApiError(400, { message: 'Bad input' });
    expect(err.message).toBe('Bad input');
  });

  it('falls back to a generic message when the body has no message', async () => {
    const err = new ApiError(500, { some: 'thing' });
    expect(err.message).toBe('API error 500');
  });

  it('returns null for an empty response body instead of throwing on JSON.parse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    global.fetch = fetchMock as any;

    const result = await api.delete('/queue/1');
    expect(result).toBeNull();
  });

  it('serializes POST bodies to JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('null', { status: 200 }));
    global.fetch = fetchMock as any;

    await api.post('/clients', { name: 'Alex' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Alex' }));
  });

  describe('download', () => {
    it('extracts the filename from a Content-Disposition header', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('data', {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="report.pdf"' },
        }),
      );
      global.fetch = fetchMock as any;

      const { filename } = await api.download('/reports/export');
      expect(filename).toBe('report.pdf');
    });

    it('returns a null filename when the header is missing', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('data', { status: 200 }));
      global.fetch = fetchMock as any;

      const { filename } = await api.download('/reports/export');
      expect(filename).toBeNull();
    });

    it('throws ApiError on a failed download', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Gone' }), { status: 404 }));
      global.fetch = fetchMock as any;

      await expect(api.download('/reports/export')).rejects.toMatchObject({ status: 404 });
    });
  });
});
