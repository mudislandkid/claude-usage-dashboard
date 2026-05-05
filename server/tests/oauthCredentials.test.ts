import { describe, it, expect } from 'vitest';
import { loadOauthCredentials } from '../src/lib/oauthCredentials.js';

describe('loadOauthCredentials', () => {
  it('returns null when no file and not on darwin', () => {
    const r = loadOauthCredentials({
      filePath: '/non/existent',
      platform: 'linux',
      exists: () => false,
    });
    expect(r).toBeNull();
  });

  it('reads accessToken from file when present', () => {
    const r = loadOauthCredentials({
      filePath: '/fake/credentials.json',
      platform: 'linux',
      exists: () => true,
      readFile: () => JSON.stringify({ claudeAiOauth: { accessToken: 'sk-test-123' } }),
    });
    expect(r?.accessToken).toBe('sk-test-123');
    expect(r?.source).toBe('file');
  });

  it('falls back to keychain on darwin when file is missing', () => {
    const r = loadOauthCredentials({
      filePath: '/non/existent',
      platform: 'darwin',
      username: 'greg',
      exists: () => false,
      exec: ((_cmd: string, args: string[]) => {
        expect(args).toEqual([
          'find-generic-password',
          '-s',
          'Claude Code-credentials',
          '-a',
          'greg',
          '-w',
        ]);
        return JSON.stringify({ claudeAiOauth: { accessToken: 'kc-token' } });
      }) as unknown as typeof import('node:child_process').execFileSync,
    });
    expect(r?.accessToken).toBe('kc-token');
    expect(r?.source).toBe('keychain');
  });

  it('returns null when keychain throws', () => {
    const r = loadOauthCredentials({
      filePath: '/non/existent',
      platform: 'darwin',
      exists: () => false,
      exec: (() => {
        throw new Error('keychain locked');
      }) as unknown as typeof import('node:child_process').execFileSync,
    });
    expect(r).toBeNull();
  });

  it('returns null when file JSON is invalid', () => {
    const r = loadOauthCredentials({
      filePath: '/fake/credentials.json',
      platform: 'linux',
      exists: () => true,
      readFile: () => '{ not valid json',
    });
    expect(r).toBeNull();
  });

  it('returns null when accessToken is missing or empty', () => {
    const r = loadOauthCredentials({
      filePath: '/fake/credentials.json',
      platform: 'linux',
      exists: () => true,
      readFile: () => JSON.stringify({ claudeAiOauth: { accessToken: '' } }),
    });
    expect(r).toBeNull();
  });
});
