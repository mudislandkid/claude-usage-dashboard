import { describe, it, expect } from 'vitest';
import { readActiveAccount } from '../src/lib/activeAccount.js';

describe('readActiveAccount', () => {
  const good = JSON.stringify({
    oauthAccount: {
      accountUuid: 'uuid-123',
      emailAddress: 'greg@example.com',
      organizationName: 'Ice Point Labs',
    },
  });

  it('parses the active account', () => {
    const a = readActiveAccount({ path: '/x', readFile: () => good });
    expect(a).toEqual({
      accountUuid: 'uuid-123',
      email: 'greg@example.com',
      organizationName: 'Ice Point Labs',
    });
  });

  it('returns null when the file is missing', () => {
    const a = readActiveAccount({
      path: '/x',
      readFile: () => {
        throw new Error('ENOENT');
      },
    });
    expect(a).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    const a = readActiveAccount({ path: '/x', readFile: () => '{not json' });
    expect(a).toBeNull();
  });

  it('returns null when oauthAccount is absent', () => {
    const a = readActiveAccount({ path: '/x', readFile: () => '{"userID":"z"}' });
    expect(a).toBeNull();
  });

  it('returns null when accountUuid or email is missing', () => {
    const a = readActiveAccount({
      path: '/x',
      readFile: () => JSON.stringify({ oauthAccount: { emailAddress: 'g@x.com' } }),
    });
    expect(a).toBeNull();
  });

  it('tolerates a missing organizationName', () => {
    const a = readActiveAccount({
      path: '/x',
      readFile: () =>
        JSON.stringify({ oauthAccount: { accountUuid: 'u', emailAddress: 'g@x.com' } }),
    });
    expect(a?.organizationName).toBeNull();
  });
});
