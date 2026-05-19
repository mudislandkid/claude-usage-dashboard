import type { ProjectRow } from '@/hooks/useProjects';

export interface ProjectNode {
  project: ProjectRow;
  apiCost: number;
  /** Direct children only (already attached) */
  children: ProjectNode[];
  /** Aggregated values including this node + every descendant */
  rollup: {
    totalTokens: number;
    sessionCount: number;
    apiCost: number;
    lastTouched: string;
    isActive: boolean;
    descendantCount: number;
  };
  depth: number;
}

/**
 * Build a forest of projects keyed by filesystem-path containment.
 * A project B is a child of A when A.projectPath is a directory ancestor
 * of B.projectPath (longest such A wins). Projects whose paths share no
 * ancestor in the input become roots.
 */
export function buildProjectTree(
  projects: ProjectRow[],
  costByPath: Map<string, number>,
): ProjectNode[] {
  // Sort by path length (shortest first) — guarantees a parent is created
  // before any descendant is attached to it.
  const sorted = [...projects].sort(
    (a, b) => a.projectPath.length - b.projectPath.length,
  );

  const byPath = new Map<string, ProjectNode>();
  const roots: ProjectNode[] = [];

  for (const p of sorted) {
    const node: ProjectNode = {
      project: p,
      apiCost: costByPath.get(p.projectPath) ?? 0,
      children: [],
      depth: 0,
      rollup: {
        totalTokens: p.totalTokens,
        sessionCount: p.sessionCount,
        apiCost: costByPath.get(p.projectPath) ?? 0,
        lastTouched: p.lastTouched,
        isActive: p.isActive,
        descendantCount: 0,
      },
    };
    const parent = findParent(p.projectPath, byPath);
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    byPath.set(p.projectPath, node);
  }

  // Roll up aggregates bottom-up.
  for (const r of roots) rollUp(r);

  return roots;
}

function findParent(
  path: string,
  byPath: Map<string, ProjectNode>,
): ProjectNode | null {
  let best: ProjectNode | null = null;
  for (const [candidatePath, node] of byPath) {
    if (path.length <= candidatePath.length) continue;
    if (!path.startsWith(candidatePath + '/')) continue;
    if (!best || candidatePath.length > best.project.projectPath.length) {
      best = node;
    }
  }
  return best;
}

function rollUp(node: ProjectNode): void {
  for (const child of node.children) {
    rollUp(child);
    node.rollup.totalTokens += child.rollup.totalTokens;
    node.rollup.sessionCount += child.rollup.sessionCount;
    node.rollup.apiCost += child.rollup.apiCost;
    node.rollup.descendantCount += 1 + child.rollup.descendantCount;
    if (child.rollup.lastTouched > node.rollup.lastTouched) {
      node.rollup.lastTouched = child.rollup.lastTouched;
    }
    if (child.rollup.isActive) node.rollup.isActive = true;
  }
}

export type SortKey = 'recent' | 'tokens' | 'sessions';

export function sortTree(nodes: ProjectNode[], sort: SortKey): ProjectNode[] {
  const sorted = [...nodes].sort((a, b) => compare(a, b, sort));
  for (const n of sorted) {
    n.children = sortTree(n.children, sort);
  }
  return sorted;
}

function compare(a: ProjectNode, b: ProjectNode, sort: SortKey): number {
  if (sort === 'tokens') return b.rollup.totalTokens - a.rollup.totalTokens;
  if (sort === 'sessions') return b.rollup.sessionCount - a.rollup.sessionCount;
  return (
    new Date(b.rollup.lastTouched).getTime() -
    new Date(a.rollup.lastTouched).getTime()
  );
}

export interface FilterResult {
  /** Tree pruned to only branches that match (or contain a match). */
  tree: ProjectNode[];
  /** Paths that should be force-expanded so matches are visible. */
  expandPaths: Set<string>;
}

export function filterTree(
  nodes: ProjectNode[],
  predicate: (n: ProjectNode) => boolean,
): FilterResult {
  const expandPaths = new Set<string>();
  const walk = (list: ProjectNode[]): ProjectNode[] => {
    const out: ProjectNode[] = [];
    for (const n of list) {
      const matchedChildren = walk(n.children);
      const selfMatch = predicate(n);
      if (selfMatch || matchedChildren.length > 0) {
        if (matchedChildren.length > 0) expandPaths.add(n.project.projectPath);
        out.push({ ...n, children: matchedChildren });
      }
    }
    return out;
  };
  return { tree: walk(nodes), expandPaths };
}

/** Status filter applied to the *rollup* — a parent counts as active if any descendant is. */
export function filterByStatus(
  nodes: ProjectNode[],
  status: 'all' | 'active' | 'idle',
): ProjectNode[] {
  if (status === 'all') return nodes;
  const want = status === 'active';
  const walk = (list: ProjectNode[]): ProjectNode[] => {
    const out: ProjectNode[] = [];
    for (const n of list) {
      const kids = walk(n.children);
      if (n.rollup.isActive === want || kids.length > 0) {
        out.push({ ...n, children: kids });
      }
    }
    return out;
  };
  return walk(nodes);
}

export interface FlatRow {
  node: ProjectNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

/** Walk the tree in display order, honoring the expand set. */
export function flattenTree(
  nodes: ProjectNode[],
  expanded: Set<string>,
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (list: ProjectNode[], depth: number) => {
    for (const n of list) {
      const isExpanded = expanded.has(n.project.projectPath);
      out.push({
        node: n,
        depth,
        hasChildren: n.children.length > 0,
        isExpanded,
      });
      if (isExpanded && n.children.length > 0) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return out;
}

/** Count total nodes (including descendants) — for display "X of Y" counters. */
export function countNodes(nodes: ProjectNode[]): number {
  let n = 0;
  const walk = (list: ProjectNode[]) => {
    for (const item of list) {
      n += 1;
      walk(item.children);
    }
  };
  walk(nodes);
  return n;
}
