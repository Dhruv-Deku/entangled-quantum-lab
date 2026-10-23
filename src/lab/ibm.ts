import type { BackendShape } from '../quantum/ibm-compile';

/**
 * A small client for IBM Quantum Platform (the REST API that qiskit-ibm-runtime
 * uses): exchange an API key for a token, pick a backend, submit a Sampler job
 * with OpenQASM 3, poll it, and read the samples.
 *
 * Browsers block direct calls to IBM's login server (CORS), so in development
 * the requests go through the Vite dev server's proxy (/ibm-iam, /ibm-api,
 * /ibm-api-eu, see vite.config.ts). A hosted build needs the same three
 * forwards on its server.
 */

export interface IbmSettings {
  apiKey: string;
  /** The instance's CRN, from the IBM Quantum Platform dashboard. */
  crn: string;
  region: 'us' | 'eu-de';
  /** Empty: the least busy CZ backend. */
  backend: string;
}

export const IBM_API_VERSION = '2026-04-15';
const KEY = 'entangled.ibm.v1';
const PENDING = 'entangled.ibm.job.v1';

export class IbmError extends Error {}

type Fetch = typeof fetch;

export function loadSettings(): IbmSettings | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as IbmSettings | null;
    return s && s.apiKey && s.crn ? s : null;
  } catch {
    return null;
  }
}

export function saveSettings(s: IbmSettings | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: settings last for this session only
  }
}

export interface PendingJob {
  id: string;
  backend: string;
  n: number;
  submittedAt: number;
}

export function loadPending(): PendingJob | null {
  try {
    return JSON.parse(localStorage.getItem(PENDING) ?? 'null') as PendingJob | null;
  } catch {
    return null;
  }
}

export function savePending(job: PendingJob | null): void {
  try {
    if (job) localStorage.setItem(PENDING, JSON.stringify(job));
    else localStorage.removeItem(PENDING);
  } catch {
    // ignore
  }
}

export class IbmClient {
  private token: { value: string; expires: number } | null = null;

  constructor(readonly settings: IbmSettings, private http: Fetch = (...a) => fetch(...a), private base = { iam: '/ibm-iam', api: '' }) {
    if (!this.base.api) this.base.api = settings.region === 'eu-de' ? '/ibm-api-eu' : '/ibm-api';
  }

  /** IAM: API key -> bearer token (valid about an hour; refreshed a minute early). */
  private async bearer(): Promise<string> {
    if (this.token && Date.now() < this.token.expires) return this.token.value;
    const res = await this.http(`${this.base.iam}/identity/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: `grant_type=${encodeURIComponent('urn:ibm:params:oauth:grant-type:apikey')}&apikey=${encodeURIComponent(this.settings.apiKey)}`,
    });
    if (!res.ok) throw new IbmError(res.status === 400 || res.status === 401 ? 'IBM did not accept the API key.' : `IBM login failed (${res.status}).`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new IbmError('IBM login returned no token.');
    this.token = { value: body.access_token, expires: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
    return body.access_token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.http(`${this.base.api}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.bearer()}`,
        'Service-CRN': this.settings.crn,
        'IBM-API-Version': IBM_API_VERSION,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      let detail = '';
      try {
        const e = (await res.json()) as { errors?: { message?: string }[]; message?: string };
        detail = e.errors?.[0]?.message ?? e.message ?? '';
      } catch {
        // no JSON body
      }
      throw new IbmError(`IBM ${path.split('/')[1]} request failed (${res.status})${detail ? `: ${detail}` : ''}.`);
    }
    return (await res.json()) as T;
  }

  /** Backend names this instance can use. */
  async backends(): Promise<string[]> {
    const r = await this.call<unknown>('/backends');
    const list = Array.isArray(r) ? r : ((r as { devices?: unknown[]; backends?: unknown[] }).devices ?? (r as { backends?: unknown[] }).backends ?? []);
    return list.map((d) => (typeof d === 'string' ? d : (d as { name?: string; backend_name?: string }).name ?? (d as { backend_name?: string }).backend_name ?? '')).filter(Boolean);
  }

  async status(name: string): Promise<{ operational: boolean; queue: number }> {
    const s = await this.call<{ state?: boolean; status?: string; length_queue?: number; pending_jobs?: number }>(`/backends/${encodeURIComponent(name)}/status`);
    return { operational: s.state !== false && s.status !== 'internal' && s.status !== 'maintenance', queue: s.length_queue ?? s.pending_jobs ?? 0 };
  }

  async configuration(name: string): Promise<BackendShape> {
    const c = await this.call<{ backend_name?: string; n_qubits?: number; coupling_map?: [number, number][]; basis_gates?: string[]; supported_instructions?: string[] }>(`/backends/${encodeURIComponent(name)}/configuration`);
    return {
      name: c.backend_name ?? name,
      nQubits: c.n_qubits ?? 0,
      couplingMap: c.coupling_map ?? [],
      basisGates: c.basis_gates ?? c.supported_instructions ?? [],
    };
  }

  /** Readout error per qubit from calibration data, and which qubits are working (best effort). */
  async calibration(name: string, nQubits: number): Promise<{ score: (q: number) => number; usable: (q: number) => boolean }> {
    try {
      const p = await this.call<{ qubits?: { name: string; value: number }[][] }>(`/backends/${encodeURIComponent(name)}/properties`);
      const read = (q: number, key: string) => p.qubits?.[q]?.find((x) => x.name === key)?.value;
      return {
        score: (q) => read(q, 'readout_error') ?? 0.05,
        usable: (q) => q < nQubits && read(q, 'operational') !== 0,
      };
    } catch {
      return { score: () => 0, usable: () => true };
    }
  }

  /** The configured backend, or the operational CZ backend with the shortest queue. */
  async pickBackend(): Promise<BackendShape> {
    if (this.settings.backend) return this.configuration(this.settings.backend);
    const names = await this.backends();
    if (!names.length) throw new IbmError('This IBM instance has no backends.');
    const candidates: { b: BackendShape; queue: number }[] = [];
    for (const name of names.slice(0, 8)) {
      try {
        const [b, s] = await Promise.all([this.configuration(name), this.status(name)]);
        if (s.operational && b.basisGates.includes('cz')) candidates.push({ b, queue: s.queue });
      } catch {
        // skip a backend we cannot read
      }
    }
    if (!candidates.length) throw new IbmError('No operational backend with CZ gates right now.');
    return candidates.sort((a, b) => a.queue - b.queue)[0].b;
  }

  async submit(qasm: string, backend: string, shots: number): Promise<string> {
    const r = await this.call<{ id?: string }>('/jobs', {
      method: 'POST',
      body: JSON.stringify({ program_id: 'sampler', backend, params: { pubs: [[qasm, null, shots]], version: 2 } }),
    });
    if (!r.id) throw new IbmError('IBM accepted the job but returned no id.');
    return r.id;
  }

  /** Queued, Running, Completed, Failed or Cancelled (and a reason when it failed). */
  async job(id: string): Promise<{ status: string; reason?: string }> {
    const j = await this.call<{ status?: string; state?: { status?: string; reason?: string } }>(`/jobs/${encodeURIComponent(id)}`);
    return { status: j.state?.status ?? j.status ?? 'Unknown', reason: j.state?.reason };
  }

  /** The Sampler's samples for the first circuit: hex strings, bit i = classical bit i. */
  async samples(id: string): Promise<string[]> {
    const r = await this.call<{ results?: { data?: Record<string, { samples?: string[] }> }[] }>(`/jobs/${encodeURIComponent(id)}/results`);
    const data = r.results?.[0]?.data ?? {};
    const reg = data.c ?? Object.values(data)[0];
    if (!reg?.samples) throw new IbmError('The job finished but returned no samples.');
    return reg.samples;
  }
}
