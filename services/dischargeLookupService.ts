/**
 * Discharge lookup (cpbq BigQuery, keyed by mã KCB = ma_bn).
 * Enrichment only: every failure resolves to {} so callers treat the case as
 * discharged by default and never hide cases.
 */
export interface DischargeInfo {
  ngayRa: string;
  thangQt: string;
  namQt: string;
}

export type DischargeMap = Record<string, DischargeInfo>;

const BATCH = 200;
const TIMEOUT_MS = 8000;

const cache = new Map<string, DischargeInfo>();

function endpoint(): string {
  try {
    return (import.meta as any).env?.VITE_CPBQ_API_URL || 'https://cpbq-react.vercel.app';
  } catch {
    return 'https://cpbq-react.vercel.app';
  }
}

async function fetchBatch(url: string, ids: string[], apiKey?: string): Promise<DischargeMap> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/bq/discharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      body: JSON.stringify({ ids }),
      signal: ctrl.signal,
    });
    if (!res.ok) return {};
    const json = await res.json();
    return (json?.discharge as DischargeMap) || {};
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** Returns discharge info for found ids only. Never throws. */
export async function lookupDischarge(patientIds: string[], opts?: { url?: string; apiKey?: string }): Promise<DischargeMap> {
  const url = opts?.url ?? endpoint();
  if (!url) return {};
  const apiKey = opts?.apiKey ?? (import.meta as any).env?.VITE_CPBQ_API_KEY;

  const ids = [...new Set(patientIds.map(i => i.trim()).filter(Boolean))];
  const result: DischargeMap = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit) result[id] = hit;
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += BATCH) {
    const found = await fetchBatch(url, missing.slice(i, i + BATCH), apiKey);
    for (const [id, info] of Object.entries(found)) {
      cache.set(id, info);
      result[id] = info;
    }
  }
  return result;
}

export function clearDischargeCache(): void {
  cache.clear();
}
