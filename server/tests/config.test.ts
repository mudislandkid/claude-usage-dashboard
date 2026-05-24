import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('PORT default', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.PORT;
    delete process.env.CUD_BUNDLED;
    vi.resetModules();
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to 8790 in normal mode', async () => {
    const m = await import('../src/config.js');
    expect(m.PORT).toBe(8790);
  });

  it('defaults to 0 (OS-assigned) when CUD_BUNDLED=1', async () => {
    process.env.CUD_BUNDLED = '1';
    const m = await import('../src/config.js');
    expect(m.PORT).toBe(0);
  });

  it('honors explicit PORT even when bundled', async () => {
    process.env.CUD_BUNDLED = '1';
    process.env.PORT = '9999';
    const m = await import('../src/config.js');
    expect(m.PORT).toBe(9999);
  });
});
