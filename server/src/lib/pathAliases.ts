export interface PathAlias {
  from: string;
  to: string;
}

/**
 * Rewrite `raw` using the longest matching `from`-prefix.
 * Aliases are NOT chained — point each alias directly at its final target.
 */
export function canonicalizePath(raw: string, aliases: PathAlias[]): string {
  let best: PathAlias | null = null;
  for (const a of aliases) {
    if (raw === a.from || raw.startsWith(a.from + '/')) {
      if (!best || a.from.length > best.from.length) best = a;
    }
  }
  if (!best) return raw;
  return best.to + raw.slice(best.from.length);
}

/**
 * Given a canonical path and a candidate list of raw paths (typically the
 * distinct `project_path` values from the DB), return every raw path that
 * canonicalizes to it — including the canonical path itself when present.
 */
export function expandCanonical(
  canonical: string,
  candidates: string[],
  aliases: PathAlias[],
): string[] {
  const matches = new Set<string>();
  for (const raw of candidates) {
    if (canonicalizePath(raw, aliases) === canonical) matches.add(raw);
  }
  if (matches.size === 0) matches.add(canonical);
  return [...matches];
}
