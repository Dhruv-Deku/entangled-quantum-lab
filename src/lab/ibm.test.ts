import { describe, expect, it } from 'vitest';
import { IBM_API_VERSION, IbmClient, IbmError } from './ibm';

/**
 * The client against a scripted stand-in for IBM's servers: it checks every
 * request the client sends (paths, headers, body) and answers like the real API.
 */
function fakeIbm(opts: { badKey?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  const http = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const h = (init.headers ?? {}) as Record<string, string>;
    if (url === '/ibm-iam/identity/token') {
      if (opts.badKey) return reply({ errorMessage: 'bad key' }, 400);
      expect(String(init.body)).toContain('apikey=KEY123');
      return reply({ access_token: 'TOKEN', expires_in: 3600 });
    }
    expect(h.Authorization).toBe('Bearer TOKEN');
    expect(h['Service-CRN']).toBe('crn:v1:test');
    expect(h['IBM-API-Version']).toBe(IBM_API_VERSION);
    if (url.endsWith('/api/v1/backends')) return reply({ devices: ['ibm_ecr', 'ibm_fez', 'ibm_torino'] });
    if (url.endsWith('/configuration')) {
      const name = url.split('/').slice(-2)[0];
      return reply({ backend_name: name, n_qubits: 156, coupling_map: [[0, 1], [1, 2]], basis_gates: name === 'ibm_ecr' ? ['ecr', 'rz', 'sx', 'x'] : ['cz', 'rz', 'sx', 'x'] });
    }
    if (url.endsWith('/status')) return reply({ state: true, status: 'active', length_queue: url.includes('fez') ? 40 : 3 });
    if (url.endsWith('/api/v1/jobs')) {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ program_id: 'sampler', backend: 'ibm_torino', params: { version: 2 } });
      expect(body.params.pubs[0][0]).toMatch(/^OPENQASM 3/);
      expect(body.params.pubs[0][2]).toBe(1000);
      return reply({ id: 'job-1', backend: 'ibm_torino' });
    }
    if (url.endsWith('/jobs/job-1')) return reply({ id: 'job-1', state: { status: 'Completed' } });
    if (url.endsWith('/jobs/job-1/results')) return reply({ results: [{ data: { c: { samples: ['0x0', '0x3', '0x3'], num_bits: 2 } } }] });
    return reply({ message: 'not found' }, 404);
  }) as typeof fetch;
  return { http, calls };
}

const settings = { apiKey: 'KEY123', crn: 'crn:v1:test', region: 'us' as const, backend: '' };

describe('IBM Quantum client', () => {
  it('logs in once, picks the least busy CZ backend, submits, polls and reads samples', async () => {
    const { http, calls } = fakeIbm();
    const c = new IbmClient(settings, http);
    const b = await c.pickBackend();
    expect(b.name).toBe('ibm_torino'); // fez is busier, ibm_ecr has no CZ
    const id = await c.submit('OPENQASM 3.0;\n', b.name, 1000);
    expect(await c.job(id)).toEqual({ status: 'Completed', reason: undefined });
    expect(await c.samples(id)).toEqual(['0x0', '0x3', '0x3']);
    expect(calls.filter((x) => x.url.includes('identity/token'))).toHaveLength(1);
    expect(calls.every((x) => x.url.startsWith('/ibm-iam') || x.url.startsWith('/ibm-api/'))).toBe(true);
  });

  it('a rejected key is a clear error; the EU region uses its own proxy path', async () => {
    await expect(new IbmClient(settings, fakeIbm({ badKey: true }).http).backends()).rejects.toThrow(IbmError);
    const { http, calls } = fakeIbm();
    await new IbmClient({ ...settings, region: 'eu-de' }, http).backends().catch(() => undefined);
    expect(calls.some((x) => x.url.startsWith('/ibm-api-eu/api/v1'))).toBe(true);
  });
});
