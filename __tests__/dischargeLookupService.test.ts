import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupDischarge, clearDischargeCache } from '../services/dischargeLookupService';

const URL = 'http://cpbq.test';

describe('dischargeLookupService', () => {
  beforeEach(() => clearDischargeCache());
  afterEach(() => vi.unstubAllGlobals());

  it('returns {} when no URL is configured', async () => {
    expect(await lookupDischarge(['1'], { url: '' })).toEqual({});
  });

  it('returns {} when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await lookupDischarge(['1'], { url: URL })).toEqual({});
  });

  it('returns {} on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await lookupDischarge(['1'], { url: URL })).toEqual({});
  });

  it('returns found ids, trims/dedupes, and caches', async () => {
    const info = { ngayRa: '2026-07-10', thangQt: '7', namQt: '2026' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ discharge: { '1': info } }) });
    vi.stubGlobal('fetch', fetchMock);
    const r1 = await lookupDischarge([' 1', '1', '2'], { url: URL });
    expect(r1).toEqual({ '1': info });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ids).toEqual(['1', '2']);
    await lookupDischarge(['1'], { url: URL });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
