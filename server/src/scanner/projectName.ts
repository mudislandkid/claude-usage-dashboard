export function projectNameFromCwd(cwd: string | null): string {
  if (!cwd) return 'unknown';
  const parts = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return parts.at(-1) || 'unknown';
}

export function projectKeyFromCwd(cwd: string | null): string {
  return cwd ?? 'unknown';
}
