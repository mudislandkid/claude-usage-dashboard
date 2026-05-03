# Claude Usage Dashboard v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only Node + React dashboard that ingests Claude Code JSONL transcripts and surfaces six high-signal views (5h-window gauge, cache effectiveness, subagent attribution, project leaderboard, activity heatmap, model mix).

**Architecture:** Two-package npm workspace. `server/` = Fastify + better-sqlite3 + chokidar; `web/` = Vite + React + Tailwind + shadcn + recharts. One root `npm run dev` starts both via concurrently. Data lives in `~/.claude/usage-dashboard.db` (separate from phuryn's DB).

**Tech Stack:** Node 20+, TypeScript strict, Fastify 4, better-sqlite3, chokidar, zod, vitest, supertest. Vite 5, React 18, Tailwind 3, shadcn/ui, TanStack Query 5, recharts, react-router 6.

**Spec:** [`docs/superpowers/specs/2026-05-03-claude-usage-dashboard-design.md`](../specs/2026-05-03-claude-usage-dashboard-design.md)

---

## File Map

```
claude-usage-dashboard/
├── package.json                          # workspace root, concurrently runner
├── tsconfig.base.json                    # shared TS config
├── .gitignore
├── README.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts                      # entrypoint
│   │   ├── config.ts                     # paths, ports, env
│   │   ├── types.ts                      # shared types
│   │   ├── db/
│   │   │   ├── connection.ts             # better-sqlite3 init + migrations
│   │   │   ├── schema.sql                # DDL
│   │   │   └── queries/
│   │   │       ├── sessions.ts
│   │   │       ├── turns.ts
│   │   │       ├── projects.ts
│   │   │       ├── window.ts
│   │   │       ├── heatmap.ts
│   │   │       ├── cache.ts
│   │   │       ├── modelMix.ts
│   │   │       └── settings.ts
│   │   ├── scanner/
│   │   │   ├── parser.ts                 # parse one JSONL line → ParsedTurn
│   │   │   ├── projectName.ts            # cwd → friendly name
│   │   │   ├── subagent.ts               # detect subagent + parent linkage
│   │   │   └── scanner.ts                # walk + incremental scan
│   │   ├── watcher/
│   │   │   └── watcher.ts                # chokidar wrapper
│   │   └── api/
│   │       ├── server.ts                 # Fastify app factory
│   │       └── routes/
│   │           ├── health.ts
│   │           ├── window.ts
│   │           ├── projects.ts
│   │           ├── sessions.ts
│   │           ├── heatmap.ts
│   │           ├── cache.ts
│   │           ├── modelMix.ts
│   │           ├── settings.ts
│   │           └── scan.ts
│   └── tests/
│       ├── fixtures/
│       │   ├── normal-turn.jsonl
│       │   ├── subagent-turn.jsonl
│       │   ├── malformed.jsonl
│       │   └── cache-split.jsonl
│       ├── parser.test.ts
│       ├── scanner.test.ts
│       ├── subagent.test.ts
│       ├── queries.test.ts
│       └── api.test.ts
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── components.json                   # shadcn config
    ├── index.html
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── index.css
    │   ├── lib/
    │   │   ├── api.ts                    # fetch wrapper
    │   │   ├── format.ts                 # numbers, dates, durations
    │   │   └── utils.ts                  # shadcn cn helper
    │   ├── components/
    │   │   ├── ui/                       # shadcn primitives (generated)
    │   │   ├── layout/
    │   │   │   ├── AppShell.tsx
    │   │   │   └── Sidebar.tsx
    │   │   └── widgets/
    │   │       ├── WindowGauge.tsx
    │   │       ├── CacheScore.tsx
    │   │       ├── ProjectLeaderboard.tsx
    │   │       ├── ActivityHeatmap.tsx
    │   │       ├── ModelMix.tsx
    │   │       └── SubagentTree.tsx
    │   ├── hooks/
    │   │   ├── useWindow.ts
    │   │   ├── useProjects.ts
    │   │   ├── useProject.ts
    │   │   ├── useSession.ts
    │   │   ├── useHeatmap.ts
    │   │   ├── useCacheScore.ts
    │   │   ├── useModelMix.ts
    │   │   └── useSettings.ts
    │   └── pages/
    │       ├── Dashboard.tsx
    │       ├── Projects.tsx
    │       ├── ProjectDetail.tsx
    │       ├── SessionDetail.tsx
    │       └── Settings.tsx
    └── tests/
        ├── format.test.ts
        └── widgets.test.tsx
```

**500-line cap:** every file. Most are well under 200.

---

## Phase 0 — Foundation

### Task 0.1: Workspace scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Write root package.json**

```json
{
  "name": "claude-usage-dashboard",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["server", "web"],
  "scripts": {
    "dev": "concurrently -n server,web -c blue,magenta \"npm:dev -w server\" \"npm:dev -w web\"",
    "build": "npm run build -w server && npm run build -w web",
    "test": "npm run test -w server && npm run test -w web",
    "typecheck": "npm run typecheck -w server && npm run typecheck -w web"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 3: Update .gitignore**

```
node_modules/
dist/
build/
.DS_Store
*.log
.env
.env.local
phuryn-reference/
.project-mapper.db*
.cache/
coverage/
```

- [ ] **Step 4: Write minimal README**

```markdown
# Claude Usage Dashboard

Local dashboard that surfaces 5h-window burn, cache effectiveness, subagent attribution, project leaderboard, activity heatmap, and model mix from Claude Code JSONL transcripts.

## Run

```bash
npm install
npm run dev
```

Server: http://localhost:8787
Web:    http://localhost:5173

The user starts and stops the dev server.
```

- [ ] **Step 5: Install root deps**

Run: `npm install`
Expected: lockfile created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore README.md package-lock.json
git commit -m "chore: workspace scaffolding"
```

---

### Task 0.2: Server package scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/src/index.ts`
- Create: `server/src/config.ts`

- [ ] **Step 1: Write server/package.json**

```json
{
  "name": "@cud/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p .",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc -p . --noEmit"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/static": "^7.0.4",
    "better-sqlite3": "^11.3.0",
    "chokidar": "^3.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write server/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write server/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write server/src/config.ts**

```ts
import os from 'node:os';
import path from 'node:path';

export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
export const DB_PATH = path.join(os.homedir(), '.claude', 'usage-dashboard.db');
export const PORT = Number(process.env.PORT ?? 8787);
export const HOST = process.env.HOST ?? '127.0.0.1';
```

- [ ] **Step 5: Write server/src/index.ts (placeholder boot)**

```ts
import { PORT, HOST } from './config.js';

console.log(`[boot] server placeholder — will start on http://${HOST}:${PORT}`);
```

- [ ] **Step 6: Install + verify boot**

Run: `npm install -w server`
Run: `npm run dev -w server`
Expected: prints the boot line, exits cleanly when killed. Stop with Ctrl-C (the user does this).

- [ ] **Step 7: Commit**

```bash
git add server/
git commit -m "chore: server package scaffolding"
```

---

### Task 0.3: Web package scaffolding

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.node.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/index.css`
- Create: `web/postcss.config.js`
- Create: `web/tailwind.config.ts`
- Create: `web/components.json`

- [ ] **Step 1: Write web/package.json**

```json
{
  "name": "@cud/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p . --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -p . --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.2",
    "@tanstack/react-query": "^5.51.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.439.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.7",
    "tailwind-merge": "^2.5.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "happy-dom": "^15.0.0",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write web/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Write web/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write web/vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
```

- [ ] **Step 5: Write web/index.html**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Usage Dashboard</title>
  </head>
  <body class="bg-background text-foreground">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write web/postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Write web/tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

- [ ] **Step 8: Write web/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 222 47% 6%;
    --foreground: 210 40% 96%;
    --card: 222 47% 8%;
    --card-foreground: 210 40% 96%;
    --primary: 210 40% 96%;
    --primary-foreground: 222 47% 11%;
    --secondary: 217 33% 17%;
    --secondary-foreground: 210 40% 96%;
    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 65%;
    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 96%;
    --destructive: 0 63% 45%;
    --destructive-foreground: 210 40% 96%;
    --border: 217 33% 17%;
    --input: 217 33% 17%;
    --ring: 217 33% 30%;
    --radius: 0.5rem;
  }

  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  }
}
```

- [ ] **Step 9: Write web/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: { refetchInterval: 30_000, staleTime: 15_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Write web/src/App.tsx (placeholder)**

```tsx
export default function App() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Claude Usage Dashboard</h1>
      <p className="text-muted-foreground mt-2">Boot test — replace shortly.</p>
    </div>
  );
}
```

- [ ] **Step 11: Write web/components.json (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 12: Write web/src/lib/utils.ts**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 13: Install + verify**

Run: `npm install -w web`
The user starts dev: `npm run dev -w web` — verify the placeholder page renders dark with the title.

- [ ] **Step 14: Commit**

```bash
git add web/
git commit -m "chore: web package scaffolding with Vite + Tailwind + shadcn config"
```

---

## Phase 1 — DB Layer

### Task 1.1: DB connection + schema

**Files:**
- Create: `server/src/db/schema.sql`
- Create: `server/src/db/connection.ts`
- Create: `server/tests/queries.test.ts` (will be filled in next tasks)

- [ ] **Step 1: Write schema.sql**

```sql
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  mtime REAL NOT NULL,
  size_bytes INTEGER NOT NULL,
  lines_processed INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  is_subagent INTEGER NOT NULL DEFAULT 0,
  parent_session_id TEXT,
  first_ts TEXT NOT NULL,
  last_ts TEXT NOT NULL,
  primary_model TEXT,
  entrypoint TEXT,
  version TEXT,
  git_branch TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
CREATE INDEX IF NOT EXISTS idx_sessions_last_ts ON sessions(last_ts);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT,
  ts TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_5m INTEGER NOT NULL DEFAULT 0,
  cache_creation_1h INTEGER NOT NULL DEFAULT 0,
  service_tier TEXT,
  is_subagent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turns_ts ON turns(ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_message_id
  ON turns(message_id) WHERE message_id IS NOT NULL AND message_id != '';

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 2: Write connection.ts**

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

export function openDb(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}
```

- [ ] **Step 3: Write a smoke test for openDb**

Create `server/tests/queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';

describe('openDb', () => {
  it('opens an in-memory db and creates expected tables', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('sessions');
    expect(names).toContain('turns');
    expect(names).toContain('files');
    expect(names).toContain('settings');
    db.close();
  });
});
```

Note: `:memory:` will fail to read `schema.sql` relative path the first time — verify path resolution works in dev. If not, copy schema.sql to `dist/db/schema.sql` via tsconfig or read it inline in tests.

- [ ] **Step 4: Run test**

Run: `npm test -w server`
Expected: PASS.

If FAIL with "schema.sql not found" — adjust connection.ts to read schema relative to module URL using `import.meta.url`. Already shown above; if still failing, add a `tsx` build step that copies `schema.sql` next to compiled JS, or inline the schema string in `schema.ts` and have `connection.ts` import it.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/ server/tests/queries.test.ts
git commit -m "feat(db): connection + schema with sessions/turns/files/settings tables"
```

---

### Task 1.2: Session and turn queries

**Files:**
- Create: `server/src/db/queries/sessions.ts`
- Create: `server/src/db/queries/turns.ts`
- Create: `server/src/types.ts`
- Modify: `server/tests/queries.test.ts`

- [ ] **Step 1: Write types.ts**

```ts
export interface Turn {
  sessionId: string;
  messageId: string | null;
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
  serviceTier: string | null;
  isSubagent: boolean;
}

export interface SessionInsert {
  sessionId: string;
  projectPath: string;
  projectName: string;
  isSubagent: boolean;
  parentSessionId: string | null;
  firstTs: string;
  lastTs: string;
  primaryModel: string | null;
  entrypoint: string | null;
  version: string | null;
  gitBranch: string | null;
}
```

- [ ] **Step 2: Write queries/turns.ts**

```ts
import type { DB } from '../connection.js';
import type { Turn } from '../../types.js';

export function insertTurn(db: DB, t: Turn): void {
  db.prepare(
    `INSERT OR IGNORE INTO turns
      (session_id, message_id, ts, model, input_tokens, output_tokens,
       cache_read_tokens, cache_creation_tokens, cache_creation_5m,
       cache_creation_1h, service_tier, is_subagent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    t.sessionId,
    t.messageId,
    t.ts,
    t.model,
    t.inputTokens,
    t.outputTokens,
    t.cacheReadTokens,
    t.cacheCreationTokens,
    t.cacheCreation5m,
    t.cacheCreation1h,
    t.serviceTier,
    t.isSubagent ? 1 : 0,
  );
}

export function turnsForSession(db: DB, sessionId: string): Turn[] {
  const rows = db
    .prepare(`SELECT * FROM turns WHERE session_id = ? ORDER BY ts ASC`)
    .all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(rowToTurn);
}

function rowToTurn(r: Record<string, unknown>): Turn {
  return {
    sessionId: r.session_id as string,
    messageId: (r.message_id as string) ?? null,
    ts: r.ts as string,
    model: r.model as string,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheCreationTokens: r.cache_creation_tokens as number,
    cacheCreation5m: r.cache_creation_5m as number,
    cacheCreation1h: r.cache_creation_1h as number,
    serviceTier: (r.service_tier as string) ?? null,
    isSubagent: r.is_subagent === 1,
  };
}
```

- [ ] **Step 3: Write queries/sessions.ts**

```ts
import type { DB } from '../connection.js';
import type { SessionInsert } from '../../types.js';

export function upsertSession(db: DB, s: SessionInsert): void {
  db.prepare(
    `INSERT INTO sessions
       (session_id, project_path, project_name, is_subagent, parent_session_id,
        first_ts, last_ts, primary_model, entrypoint, version, git_branch, turn_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(session_id) DO UPDATE SET
       project_path = excluded.project_path,
       project_name = excluded.project_name,
       is_subagent = excluded.is_subagent,
       parent_session_id = COALESCE(excluded.parent_session_id, sessions.parent_session_id),
       first_ts = MIN(sessions.first_ts, excluded.first_ts),
       last_ts = MAX(sessions.last_ts, excluded.last_ts),
       primary_model = COALESCE(excluded.primary_model, sessions.primary_model),
       entrypoint = COALESCE(excluded.entrypoint, sessions.entrypoint),
       version = COALESCE(excluded.version, sessions.version),
       git_branch = COALESCE(excluded.git_branch, sessions.git_branch)`,
  ).run(
    s.sessionId,
    s.projectPath,
    s.projectName,
    s.isSubagent ? 1 : 0,
    s.parentSessionId,
    s.firstTs,
    s.lastTs,
    s.primaryModel,
    s.entrypoint,
    s.version,
    s.gitBranch,
  );
}

export function refreshTurnCount(db: DB, sessionId: string): void {
  db.prepare(
    `UPDATE sessions SET turn_count = (
       SELECT COUNT(*) FROM turns WHERE session_id = ?
     ) WHERE session_id = ?`,
  ).run(sessionId, sessionId);
}
```

- [ ] **Step 4: Add tests**

Append to `server/tests/queries.test.ts`:

```ts
import { upsertSession } from '../src/db/queries/sessions.js';
import { insertTurn, turnsForSession } from '../src/db/queries/turns.js';

describe('sessions + turns queries', () => {
  it('upsert + insert + read', () => {
    const db = openDb(':memory:');
    upsertSession(db, {
      sessionId: 's1',
      projectPath: '/p',
      projectName: 'p',
      isSubagent: false,
      parentSessionId: null,
      firstTs: '2026-05-01T00:00:00Z',
      lastTs: '2026-05-01T00:00:00Z',
      primaryModel: 'claude-opus-4-7',
      entrypoint: 'claude-vscode',
      version: '2.1.116',
      gitBranch: 'main',
    });
    insertTurn(db, {
      sessionId: 's1',
      messageId: 'msg_1',
      ts: '2026-05-01T00:00:00Z',
      model: 'claude-opus-4-7',
      inputTokens: 6,
      outputTokens: 247,
      cacheReadTokens: 0,
      cacheCreationTokens: 36323,
      cacheCreation5m: 0,
      cacheCreation1h: 36323,
      serviceTier: 'standard',
      isSubagent: false,
    });
    const turns = turnsForSession(db, 's1');
    expect(turns).toHaveLength(1);
    expect(turns[0]?.cacheCreation1h).toBe(36323);
  });

  it('insertTurn dedupes by message_id', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    const t = baseTurn();
    insertTurn(db, t);
    insertTurn(db, t);
    expect(turnsForSession(db, 's1')).toHaveLength(1);
  });
});

function baseSession() {
  return {
    sessionId: 's1', projectPath: '/p', projectName: 'p',
    isSubagent: false, parentSessionId: null,
    firstTs: '2026-05-01T00:00:00Z', lastTs: '2026-05-01T00:00:00Z',
    primaryModel: null, entrypoint: null, version: null, gitBranch: null,
  };
}
function baseTurn() {
  return {
    sessionId: 's1', messageId: 'msg_dedup', ts: '2026-05-01T00:00:00Z',
    model: 'claude-opus-4-7', inputTokens: 1, outputTokens: 1,
    cacheReadTokens: 0, cacheCreationTokens: 0, cacheCreation5m: 0,
    cacheCreation1h: 0, serviceTier: null, isSubagent: false,
  };
}
```

- [ ] **Step 5: Run tests, verify pass, commit**

```bash
npm test -w server
git add server/src/db/queries/ server/src/types.ts server/tests/queries.test.ts
git commit -m "feat(db): session + turn queries with dedup"
```

---

### Task 1.3: Aggregate queries (window, projects, heatmap, cache, modelMix)

For each, the pattern is: write the query function → write a test with seeded data → assert.

**Files:**
- Create: `server/src/db/queries/window.ts`
- Create: `server/src/db/queries/projects.ts`
- Create: `server/src/db/queries/heatmap.ts`
- Create: `server/src/db/queries/cache.ts`
- Create: `server/src/db/queries/modelMix.ts`
- Modify: `server/tests/queries.test.ts`

- [ ] **Step 1: window.ts**

```ts
import type { DB } from '../connection.js';

export interface WindowStats {
  windowStart: string;
  windowEnd: string;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
}

export function fiveHourWindow(db: DB, now = new Date()): WindowStats {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const last15Start = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  const row = db.prepare(
    `SELECT
       COALESCE(SUM(input_tokens), 0)          AS input_tokens,
       COALESCE(SUM(output_tokens), 0)         AS output_tokens,
       COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
       COALESCE(SUM(cache_read_tokens), 0)     AS cache_read_tokens
     FROM turns WHERE ts >= ? AND ts <= ?`,
  ).get(start, end) as Record<string, number>;

  const recent = db.prepare(
    `SELECT COALESCE(SUM(input_tokens + cache_creation_tokens), 0) AS chargeable
     FROM turns WHERE ts >= ? AND ts <= ?`,
  ).get(last15Start, end) as { chargeable: number };

  const totalChargeable = (row.input_tokens ?? 0) + (row.cache_creation_tokens ?? 0);

  return {
    windowStart: start,
    windowEnd: end,
    totalChargeable,
    inputTokens: row.input_tokens ?? 0,
    cacheCreationTokens: row.cache_creation_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    cacheReadTokens: row.cache_read_tokens ?? 0,
    burnRatePerMin: (recent.chargeable ?? 0) / 15,
  };
}
```

- [ ] **Step 2: projects.ts**

```ts
import type { DB } from '../connection.js';

export interface ProjectRow {
  projectPath: string;
  projectName: string;
  sessionCount: number;
  totalTokens: number;
  lastTouched: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  isActive: boolean;
}

export function listProjects(db: DB, activeWithinDays = 14): ProjectRow[] {
  const cutoff = new Date(Date.now() - activeWithinDays * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       s.project_path,
       MAX(s.project_name)              AS project_name,
       COUNT(DISTINCT s.session_id)     AS session_count,
       MAX(s.last_ts)                   AS last_touched,
       COALESCE(SUM(t.input_tokens), 0)          AS input_tokens,
       COALESCE(SUM(t.output_tokens), 0)         AS output_tokens,
       COALESCE(SUM(t.cache_read_tokens), 0)     AS cache_read_tokens,
       COALESCE(SUM(t.cache_creation_tokens), 0) AS cache_creation_tokens
     FROM sessions s
     LEFT JOIN turns t ON t.session_id = s.session_id
     GROUP BY s.project_path
     ORDER BY last_touched DESC`,
  ).all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    projectPath: r.project_path as string,
    projectName: r.project_name as string,
    sessionCount: r.session_count as number,
    totalTokens:
      (r.input_tokens as number) +
      (r.output_tokens as number) +
      (r.cache_read_tokens as number) +
      (r.cache_creation_tokens as number),
    lastTouched: r.last_touched as string,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheCreationTokens: r.cache_creation_tokens as number,
    inputTokens: r.input_tokens as number,
    isActive: (r.last_touched as string) >= cutoff,
  }));
}

export function projectDetail(db: DB, projectPath: string) {
  const sessions = db.prepare(
    `SELECT session_id, primary_model, first_ts, last_ts, turn_count, is_subagent, parent_session_id
     FROM sessions WHERE project_path = ? ORDER BY last_ts DESC LIMIT 200`,
  ).all(projectPath);
  return { sessions };
}
```

- [ ] **Step 3: heatmap.ts**

```ts
import type { DB } from '../connection.js';

export interface HeatCell {
  weekday: number; // 0=Sun..6=Sat
  hour: number;    // 0..23
  tokens: number;
  sessionCount: number;
}

export function heatmap(db: DB, days: number): HeatCell[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  // SQLite strftime('%w') returns 0-6 (Sunday=0). %H returns hour 00-23.
  const rows = db.prepare(
    `SELECT
       CAST(strftime('%w', ts) AS INTEGER) AS weekday,
       CAST(strftime('%H', ts) AS INTEGER) AS hour,
       COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), 0) AS tokens,
       COUNT(DISTINCT session_id) AS session_count
     FROM turns WHERE ts >= ?
     GROUP BY weekday, hour`,
  ).all(cutoff) as Array<Record<string, number>>;
  return rows.map((r) => ({
    weekday: r.weekday ?? 0,
    hour: r.hour ?? 0,
    tokens: r.tokens ?? 0,
    sessionCount: r.session_count ?? 0,
  }));
}
```

- [ ] **Step 4: cache.ts**

```ts
import type { DB } from '../connection.js';

export interface CacheScore {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  effectiveness: number; // 0..1
}

export interface CacheScoreByProject extends CacheScore {
  projectPath: string;
  projectName: string;
}

function computeScore(
  read: number,
  creation: number,
  input: number,
): number {
  const denom = read + creation + input;
  return denom === 0 ? 0 : read / denom;
}

export function overallCacheScore(db: DB, days: number): CacheScore {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const r = db.prepare(
    `SELECT
       COALESCE(SUM(cache_read_tokens), 0)     AS read,
       COALESCE(SUM(cache_creation_tokens), 0) AS creation,
       COALESCE(SUM(input_tokens), 0)          AS input
     FROM turns WHERE ts >= ?`,
  ).get(cutoff) as { read: number; creation: number; input: number };
  return {
    cacheReadTokens: r.read,
    cacheCreationTokens: r.creation,
    inputTokens: r.input,
    effectiveness: computeScore(r.read, r.creation, r.input),
  };
}

export function cacheScoreByProject(
  db: DB,
  days: number,
): CacheScoreByProject[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       s.project_path,
       MAX(s.project_name) AS project_name,
       COALESCE(SUM(t.cache_read_tokens), 0)     AS read,
       COALESCE(SUM(t.cache_creation_tokens), 0) AS creation,
       COALESCE(SUM(t.input_tokens), 0)          AS input
     FROM sessions s
     JOIN turns t ON t.session_id = s.session_id
     WHERE t.ts >= ?
     GROUP BY s.project_path
     ORDER BY (read * 1.0 / NULLIF(read + creation + input, 0)) ASC`,
  ).all(cutoff) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    projectPath: r.project_path as string,
    projectName: r.project_name as string,
    cacheReadTokens: r.read as number,
    cacheCreationTokens: r.creation as number,
    inputTokens: r.input as number,
    effectiveness: computeScore(
      r.read as number,
      r.creation as number,
      r.input as number,
    ),
  }));
}
```

- [ ] **Step 5: modelMix.ts**

```ts
import type { DB } from '../connection.js';

export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'other';

export interface ModelMixRow {
  projectPath: string;
  projectName: string;
  opusTokens: number;
  sonnetTokens: number;
  haikuTokens: number;
  otherTokens: number;
}

export function classifyModel(model: string | null): ModelFamily {
  if (!model) return 'other';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

export function modelMixByProject(db: DB, days: number): ModelMixRow[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = db.prepare(
    `SELECT
       s.project_path,
       MAX(s.project_name) AS project_name,
       t.model,
       COALESCE(SUM(t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens), 0) AS tokens
     FROM sessions s
     JOIN turns t ON t.session_id = s.session_id
     WHERE t.ts >= ?
     GROUP BY s.project_path, t.model`,
  ).all(cutoff) as Array<{ project_path: string; project_name: string; model: string; tokens: number }>;

  const acc = new Map<string, ModelMixRow>();
  for (const r of rows) {
    const key = r.project_path;
    let row = acc.get(key);
    if (!row) {
      row = {
        projectPath: r.project_path,
        projectName: r.project_name,
        opusTokens: 0,
        sonnetTokens: 0,
        haikuTokens: 0,
        otherTokens: 0,
      };
      acc.set(key, row);
    }
    const family = classifyModel(r.model);
    if (family === 'opus') row.opusTokens += r.tokens;
    else if (family === 'sonnet') row.sonnetTokens += r.tokens;
    else if (family === 'haiku') row.haikuTokens += r.tokens;
    else row.otherTokens += r.tokens;
  }
  return [...acc.values()].sort(
    (a, b) =>
      b.opusTokens + b.sonnetTokens + b.haikuTokens + b.otherTokens -
      (a.opusTokens + a.sonnetTokens + a.haikuTokens + a.otherTokens),
  );
}
```

- [ ] **Step 6: Add aggregate-query tests**

Append to `server/tests/queries.test.ts`:

```ts
import { fiveHourWindow } from '../src/db/queries/window.js';
import { listProjects } from '../src/db/queries/projects.js';
import { overallCacheScore } from '../src/db/queries/cache.js';
import { classifyModel, modelMixByProject } from '../src/db/queries/modelMix.js';

describe('aggregate queries', () => {
  it('classifyModel handles known + unknown', () => {
    expect(classifyModel('claude-opus-4-7')).toBe('opus');
    expect(classifyModel('claude-haiku-4-5-20251001')).toBe('haiku');
    expect(classifyModel('something-else')).toBe('other');
    expect(classifyModel(null)).toBe('other');
  });

  it('overallCacheScore computes ratio', () => {
    const db = openDb(':memory:');
    upsertSession(db, baseSession());
    insertTurn(db, { ...baseTurn(), messageId: 'a', cacheReadTokens: 80, cacheCreationTokens: 10, inputTokens: 10 });
    const score = overallCacheScore(db, 365);
    expect(score.effectiveness).toBeCloseTo(0.8, 2);
  });

  it('listProjects flags active vs abandoned', () => {
    const db = openDb(':memory:');
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    upsertSession(db, { ...baseSession(), sessionId: 'recent', projectPath: '/r', projectName: 'r', firstTs: recent, lastTs: recent });
    upsertSession(db, { ...baseSession(), sessionId: 'old', projectPath: '/o', projectName: 'o', firstTs: old, lastTs: old });
    const projects = listProjects(db, 14);
    const recentP = projects.find((p) => p.projectPath === '/r');
    const oldP = projects.find((p) => p.projectPath === '/o');
    expect(recentP?.isActive).toBe(true);
    expect(oldP?.isActive).toBe(false);
  });
});
```

- [ ] **Step 7: Run, fix, commit**

```bash
npm test -w server
git add server/src/db/queries/ server/tests/queries.test.ts
git commit -m "feat(db): aggregate queries — window, projects, heatmap, cache, modelMix"
```

---

### Task 1.4: Settings query module

**Files:**
- Create: `server/src/db/queries/settings.ts`
- Modify: `server/tests/queries.test.ts`

- [ ] **Step 1: Write settings.ts**

```ts
import type { DB } from '../connection.js';

export interface DashboardSettings {
  windowLimitTokens: number;
  activeWithinDays: number;
  cacheScoreWindowDays: number;
}

const DEFAULTS: DashboardSettings = {
  windowLimitTokens: 220_000,
  activeWithinDays: 14,
  cacheScoreWindowDays: 7,
};

export function getSettings(db: DB): DashboardSettings {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    windowLimitTokens: numOr(map.windowLimitTokens, DEFAULTS.windowLimitTokens),
    activeWithinDays: numOr(map.activeWithinDays, DEFAULTS.activeWithinDays),
    cacheScoreWindowDays: numOr(map.cacheScoreWindowDays, DEFAULTS.cacheScoreWindowDays),
  };
}

export function updateSettings(db: DB, partial: Partial<DashboardSettings>): DashboardSettings {
  const stmt = db.prepare(
    `INSERT INTO settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  for (const [k, v] of Object.entries(partial)) {
    if (v !== undefined) stmt.run(k, String(v));
  }
  return getSettings(db);
}

function numOr(s: string | undefined, fallback: number): number {
  if (s === undefined) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
```

- [ ] **Step 2: Add test**

```ts
import { getSettings, updateSettings } from '../src/db/queries/settings.js';

describe('settings', () => {
  it('returns defaults if empty', () => {
    const db = openDb(':memory:');
    const s = getSettings(db);
    expect(s.windowLimitTokens).toBeGreaterThan(0);
    expect(s.activeWithinDays).toBe(14);
  });

  it('updates and persists', () => {
    const db = openDb(':memory:');
    updateSettings(db, { windowLimitTokens: 500_000 });
    expect(getSettings(db).windowLimitTokens).toBe(500_000);
  });
});
```

- [ ] **Step 3: Run tests, commit**

```bash
npm test -w server
git add server/src/db/queries/settings.ts server/tests/queries.test.ts
git commit -m "feat(db): settings module with defaults"
```

---

## Phase 2 — Scanner

### Task 2.1: JSONL parser

Parses one line of a Claude transcript JSONL into a `ParsedTurn` (or null if not relevant).

**Files:**
- Create: `server/src/scanner/parser.ts`
- Create: `server/tests/fixtures/normal-turn.jsonl`
- Create: `server/tests/fixtures/subagent-turn.jsonl`
- Create: `server/tests/fixtures/malformed.jsonl`
- Create: `server/tests/parser.test.ts`

- [ ] **Step 1: Write parser.ts**

```ts
import type { Turn } from '../types.js';

export interface ParsedLine {
  turn: Turn | null;
  meta: {
    sessionId: string | null;
    cwd: string | null;
    entrypoint: string | null;
    version: string | null;
    gitBranch: string | null;
    isSidechain: boolean;
  };
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
}

interface JsonlMessage {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  entrypoint?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  message?: {
    id?: string;
    model?: string;
    role?: string;
    usage?: UsageBlock;
  };
}

export function parseLine(raw: string, opts: { isSubagentFile: boolean }): ParsedLine {
  const empty: ParsedLine = {
    turn: null,
    meta: {
      sessionId: null, cwd: null, entrypoint: null,
      version: null, gitBranch: null, isSidechain: false,
    },
  };
  if (!raw.trim()) return empty;
  let obj: JsonlMessage;
  try {
    obj = JSON.parse(raw);
  } catch {
    return empty;
  }
  const meta = {
    sessionId: obj.sessionId ?? null,
    cwd: obj.cwd ?? null,
    entrypoint: obj.entrypoint ?? null,
    version: obj.version ?? null,
    gitBranch: obj.gitBranch ?? null,
    isSidechain: !!obj.isSidechain,
  };
  if (obj.type !== 'assistant') return { turn: null, meta };
  const m = obj.message;
  if (!m?.usage || !meta.sessionId || !obj.timestamp || !m.model) {
    return { turn: null, meta };
  }
  const u = m.usage;
  const turn: Turn = {
    sessionId: meta.sessionId,
    messageId: m.id ?? null,
    ts: obj.timestamp,
    model: m.model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheCreation5m: u.cache_creation?.ephemeral_5m_input_tokens ?? 0,
    cacheCreation1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    serviceTier: u.service_tier ?? null,
    isSubagent: opts.isSubagentFile || !!obj.isSidechain,
  };
  return { turn, meta };
}
```

- [ ] **Step 2: Create fixtures**

`server/tests/fixtures/normal-turn.jsonl` — paste this single line (use the structure from your real data; minimal example below):

```
{"type":"assistant","timestamp":"2026-04-21T08:10:07.707Z","sessionId":"s-abc","cwd":"/Volumes/1tbSSD/Projects-2026/test","entrypoint":"claude-vscode","version":"2.1.116","gitBranch":"main","isSidechain":false,"message":{"id":"msg_01","model":"claude-opus-4-7","role":"assistant","usage":{"input_tokens":6,"output_tokens":247,"cache_read_input_tokens":0,"cache_creation_input_tokens":36323,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":36323},"service_tier":"standard"}}}
```

`server/tests/fixtures/subagent-turn.jsonl`:

```
{"type":"assistant","timestamp":"2026-04-21T08:10:08.000Z","sessionId":"s-sub","cwd":"/Volumes/1tbSSD/Projects-2026/test","isSidechain":true,"message":{"id":"msg_02","model":"claude-haiku-4-5-20251001","role":"assistant","usage":{"input_tokens":3,"output_tokens":120,"cache_read_input_tokens":4000,"cache_creation_input_tokens":0}}}
```

`server/tests/fixtures/malformed.jsonl`:

```
not even json
{"type":"assistant"}
{"type":"user","timestamp":"2026-04-21T08:10:00Z","sessionId":"s","message":{"role":"user","content":"hi"}}
```

- [ ] **Step 3: Write parser.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLine } from '../src/scanner/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (n: string) => readFileSync(path.join(__dirname, 'fixtures', n), 'utf8').split('\n').filter(Boolean);

describe('parseLine', () => {
  it('parses a normal assistant turn', () => {
    const [line] = fix('normal-turn.jsonl');
    const { turn, meta } = parseLine(line!, { isSubagentFile: false });
    expect(turn).not.toBeNull();
    expect(turn?.sessionId).toBe('s-abc');
    expect(turn?.cacheCreation1h).toBe(36323);
    expect(turn?.isSubagent).toBe(false);
    expect(meta.entrypoint).toBe('claude-vscode');
  });

  it('marks subagent when isSidechain or path indicates', () => {
    const [line] = fix('subagent-turn.jsonl');
    const r = parseLine(line!, { isSubagentFile: false });
    expect(r.turn?.isSubagent).toBe(true);
  });

  it('returns null turn for malformed/non-assistant rows but never throws', () => {
    const lines = fix('malformed.jsonl');
    for (const line of lines) {
      expect(() => parseLine(line, { isSubagentFile: false })).not.toThrow();
      expect(parseLine(line, { isSubagentFile: false }).turn).toBeNull();
    }
  });
});
```

- [ ] **Step 4: Run, commit**

```bash
npm test -w server
git add server/src/scanner/parser.ts server/tests/fixtures/ server/tests/parser.test.ts
git commit -m "feat(scanner): JSONL parser with subagent detection"
```

---

### Task 2.2: Project name + subagent helpers

**Files:**
- Create: `server/src/scanner/projectName.ts`
- Create: `server/src/scanner/subagent.ts`
- Create: `server/tests/subagent.test.ts`

- [ ] **Step 1: projectName.ts**

```ts
export function projectNameFromCwd(cwd: string | null): string {
  if (!cwd) return 'unknown';
  const parts = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  // Last 2 components, e.g. "Projects-2026/voltwise" → "voltwise"
  return parts.at(-1) || 'unknown';
}

export function projectKeyFromCwd(cwd: string | null): string {
  return cwd ?? 'unknown';
}
```

- [ ] **Step 2: subagent.ts**

```ts
import path from 'node:path';

/**
 * Determine if a JSONL file represents a subagent transcript based on its path:
 * `<projectDir>/<sessionId>/subagents/agent-*.jsonl` → subagent.
 */
export function isSubagentFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return /\/subagents\/agent-[^/]+\.jsonl$/.test(norm);
}

/** Parent session UUID for a subagent file = the directory above `subagents/`. */
export function parentSessionFromPath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, '/');
  const m = norm.match(/\/([0-9a-f-]+)\/subagents\/agent-[^/]+\.jsonl$/i);
  return m ? m[1]! : null;
}

/** Top-level (non-subagent) JSONL: `<projectDir>/<sessionId>.jsonl`. */
export function topLevelSessionId(filePath: string): string | null {
  const base = path.basename(filePath, '.jsonl');
  return /^[0-9a-f-]{8,}$/i.test(base) ? base : null;
}
```

- [ ] **Step 3: subagent.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { isSubagentFile, parentSessionFromPath, topLevelSessionId } from '../src/scanner/subagent.js';

describe('subagent helpers', () => {
  it('detects subagent path', () => {
    expect(isSubagentFile('/p/abc/subagents/agent-xyz.jsonl')).toBe(true);
    expect(isSubagentFile('/p/abc.jsonl')).toBe(false);
  });

  it('extracts parent session id', () => {
    const fp = '/Users/g/.claude/projects/-V-x/cb3d732a-77fa-4419-a852-c1800c066dea/subagents/agent-ad333bc68401d18a6.jsonl';
    expect(parentSessionFromPath(fp)).toBe('cb3d732a-77fa-4419-a852-c1800c066dea');
  });

  it('extracts top-level session id', () => {
    expect(topLevelSessionId('/p/3d86b708-31fe-4c64-a85e-b0dc394be34c.jsonl')).toBe(
      '3d86b708-31fe-4c64-a85e-b0dc394be34c',
    );
    expect(topLevelSessionId('/p/notes.jsonl')).toBeNull();
  });
});
```

- [ ] **Step 4: Run, commit**

```bash
npm test -w server
git add server/src/scanner/projectName.ts server/src/scanner/subagent.ts server/tests/subagent.test.ts
git commit -m "feat(scanner): project name + subagent path helpers"
```

---

### Task 2.3: Incremental scanner

Walks all JSONL files under `~/.claude/projects`, processes each line via parser, upserts sessions/turns. Uses the `files` table for incremental skipping.

**Files:**
- Create: `server/src/scanner/scanner.ts`
- Create: `server/tests/scanner.test.ts`

- [ ] **Step 1: Write scanner.ts**

```ts
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import type { DB } from '../db/connection.js';
import { upsertSession, refreshTurnCount } from '../db/queries/sessions.js';
import { insertTurn } from '../db/queries/turns.js';
import { parseLine } from './parser.js';
import { projectNameFromCwd, projectKeyFromCwd } from './projectName.js';
import { isSubagentFile, parentSessionFromPath, topLevelSessionId } from './subagent.js';

export interface ScanResult {
  filesScanned: number;
  filesSkipped: number;
  turnsInserted: number;
  errors: number;
}

export async function scanAll(db: DB, projectsDir: string): Promise<ScanResult> {
  const files = walkJsonl(projectsDir);
  const result: ScanResult = { filesScanned: 0, filesSkipped: 0, turnsInserted: 0, errors: 0 };
  for (const fp of files) {
    const stat = fs.statSync(fp);
    const prev = db
      .prepare(`SELECT mtime, lines_processed FROM files WHERE path = ?`)
      .get(fp) as { mtime: number; lines_processed: number } | undefined;
    if (prev && prev.mtime === stat.mtimeMs) {
      result.filesSkipped += 1;
      continue;
    }
    const startLine = prev?.lines_processed ?? 0;
    const counted = await scanFile(db, fp, startLine, result);
    db.prepare(
      `INSERT INTO files(path, mtime, size_bytes, lines_processed, last_scanned_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(path) DO UPDATE SET
         mtime = excluded.mtime,
         size_bytes = excluded.size_bytes,
         lines_processed = excluded.lines_processed,
         last_scanned_at = excluded.last_scanned_at`,
    ).run(fp, stat.mtimeMs, stat.size, counted);
    result.filesScanned += 1;
  }
  return result;
}

async function scanFile(
  db: DB,
  fp: string,
  skipLines: number,
  result: ScanResult,
): Promise<number> {
  const subagent = isSubagentFile(fp);
  const parentSession = subagent ? parentSessionFromPath(fp) : null;
  const fallbackSessionId =
    (subagent ? path.basename(fp, '.jsonl') : topLevelSessionId(fp)) ?? path.basename(fp, '.jsonl');

  const sessionMeta = new Map<string, { firstTs: string; lastTs: string; entrypoint: string | null; version: string | null; gitBranch: string | null; cwd: string | null; primaryModel: string | null }>();

  const rl = readline.createInterface({
    input: fs.createReadStream(fp, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  const txn = db.transaction(() => {});
  for await (const raw of rl) {
    lineNo += 1;
    if (lineNo <= skipLines) continue;
    const { turn, meta } = parseLine(raw, { isSubagentFile: subagent });
    const sid = meta.sessionId ?? fallbackSessionId;
    if (turn) {
      try {
        insertTurn(db, { ...turn, sessionId: sid });
        result.turnsInserted += 1;
      } catch (e) {
        result.errors += 1;
        // continue scanning — never crash
      }
    }
    const m = sessionMeta.get(sid) ?? {
      firstTs: turn?.ts ?? meta.sessionId ? new Date().toISOString() : new Date().toISOString(),
      lastTs: turn?.ts ?? new Date().toISOString(),
      entrypoint: null, version: null, gitBranch: null, cwd: null, primaryModel: null,
    };
    if (turn) {
      if (turn.ts < m.firstTs) m.firstTs = turn.ts;
      if (turn.ts > m.lastTs) m.lastTs = turn.ts;
      if (modelRank(turn.model) > modelRank(m.primaryModel)) m.primaryModel = turn.model;
    }
    if (meta.entrypoint && !m.entrypoint) m.entrypoint = meta.entrypoint;
    if (meta.version && !m.version) m.version = meta.version;
    if (meta.gitBranch && !m.gitBranch) m.gitBranch = meta.gitBranch;
    if (meta.cwd && !m.cwd) m.cwd = meta.cwd;
    sessionMeta.set(sid, m);
  }

  for (const [sid, m] of sessionMeta) {
    upsertSession(db, {
      sessionId: sid,
      projectPath: projectKeyFromCwd(m.cwd),
      projectName: projectNameFromCwd(m.cwd),
      isSubagent: subagent,
      parentSessionId: parentSession,
      firstTs: m.firstTs,
      lastTs: m.lastTs,
      primaryModel: m.primaryModel,
      entrypoint: m.entrypoint,
      version: m.version,
      gitBranch: m.gitBranch,
    });
    refreshTurnCount(db, sid);
  }

  return lineNo;
  void txn;
}

function modelRank(m: string | null): number {
  if (!m) return 0;
  const s = m.toLowerCase();
  if (s.includes('opus')) return 3;
  if (s.includes('sonnet')) return 2;
  if (s.includes('haiku')) return 1;
  return 0;
}

function* walkJsonl(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkJsonl(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}
```

- [ ] **Step 2: Write scanner.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db/connection.js';
import { scanAll } from '../src/scanner/scanner.js';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cud-'));
}

const SAMPLE = `{"type":"assistant","timestamp":"2026-04-21T08:10:07.707Z","sessionId":"s-1","cwd":"/p/test","entrypoint":"claude-vscode","version":"2.1.116","gitBranch":"main","message":{"id":"m1","model":"claude-opus-4-7","role":"assistant","usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":100,"cache_creation_input_tokens":50,"cache_creation":{"ephemeral_5m_input_tokens":50,"ephemeral_1h_input_tokens":0}}}}\n`;

describe('scanAll', () => {
  it('scans a sample file and inserts session + turn rows', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 's-1.jsonl'), SAMPLE);
    const db = openDb(':memory:');
    const r = await scanAll(db, dir);
    expect(r.turnsInserted).toBe(1);
    const sessions = db.prepare(`SELECT * FROM sessions`).all();
    expect(sessions.length).toBe(1);
  });

  it('is incremental — re-running scans nothing new', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 's-1.jsonl'), SAMPLE);
    const db = openDb(':memory:');
    await scanAll(db, dir);
    const r2 = await scanAll(db, dir);
    expect(r2.turnsInserted).toBe(0);
    expect(r2.filesSkipped).toBe(1);
  });

  it('detects subagent files via path', async () => {
    const dir = tmp();
    const sub = path.join(dir, 'parent-uuid', 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'agent-xxx.jsonl'), SAMPLE.replace('"s-1"', '"sub-1"'));
    const db = openDb(':memory:');
    await scanAll(db, dir);
    const subRow = db.prepare(`SELECT is_subagent, parent_session_id FROM sessions WHERE session_id = ?`).get('sub-1') as any;
    expect(subRow.is_subagent).toBe(1);
    expect(subRow.parent_session_id).toBe('parent-uuid');
  });
});
```

- [ ] **Step 3: Run + iterate until green**

Run: `npm test -w server`
Common pitfalls:
- `noUncheckedIndexedAccess`: use `arr.at(-1)!` or `parts[parts.length - 1] ?? 'unknown'`.
- The `sessionMeta` initialization in `scanFile` is a bit gnarly — if there's an issue, simplify by initializing `firstTs/lastTs` to null and setting on first turn.

- [ ] **Step 4: Commit**

```bash
git add server/src/scanner/scanner.ts server/tests/scanner.test.ts
git commit -m "feat(scanner): incremental scan with session+turn upsert"
```

---

### Task 2.4: File watcher

**Files:**
- Create: `server/src/watcher/watcher.ts`

- [ ] **Step 1: Write watcher.ts**

```ts
import chokidar, { type FSWatcher } from 'chokidar';
import type { DB } from '../db/connection.js';
import { scanAll } from '../scanner/scanner.js';

export interface Watcher {
  start(): void;
  stop(): Promise<void>;
}

export function createWatcher(db: DB, projectsDir: string): Watcher {
  let watcher: FSWatcher | null = null;
  let scheduled: NodeJS.Timeout | null = null;
  let running = false;

  function trigger() {
    if (scheduled || running) return;
    scheduled = setTimeout(async () => {
      scheduled = null;
      running = true;
      try {
        const r = await scanAll(db, projectsDir);
        if (r.filesScanned > 0) {
          // eslint-disable-next-line no-console
          console.log(`[watcher] scanned ${r.filesScanned} files, +${r.turnsInserted} turns`);
        }
      } finally {
        running = false;
      }
    }, 1500);
  }

  return {
    start() {
      watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });
      watcher.on('add', trigger).on('change', trigger);
    },
    async stop() {
      if (scheduled) clearTimeout(scheduled);
      await watcher?.close();
    },
  };
}
```

(No unit test — chokidar's behavior is integration-y and we'll exercise it via the live boot in Task 4.x.)

- [ ] **Step 2: Commit**

```bash
git add server/src/watcher/
git commit -m "feat(watcher): chokidar-based incremental rescan with debounce"
```

---

## Phase 3 — API

### Task 3.1: Fastify server factory + health route

**Files:**
- Create: `server/src/api/server.ts`
- Create: `server/src/api/routes/health.ts`
- Modify: `server/src/index.ts`
- Create: `server/tests/api.test.ts`

- [ ] **Step 1: server.ts**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { DB } from '../db/connection.js';
import { healthRoute } from './routes/health.js';
import { windowRoute } from './routes/window.js';
import { projectsRoutes } from './routes/projects.js';
import { sessionRoute } from './routes/sessions.js';
import { heatmapRoute } from './routes/heatmap.js';
import { cacheRoutes } from './routes/cache.js';
import { modelMixRoute } from './routes/modelMix.js';
import { settingsRoutes } from './routes/settings.js';
import { scanRoute } from './routes/scan.js';

export interface ApiContext {
  db: DB;
  triggerScan: () => Promise<void>;
}

export async function buildApi(ctx: ApiContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(cors, { origin: true });
  app.register(healthRoute, { prefix: '/api', ctx });
  app.register(windowRoute, { prefix: '/api', ctx });
  app.register(projectsRoutes, { prefix: '/api', ctx });
  app.register(sessionRoute, { prefix: '/api', ctx });
  app.register(heatmapRoute, { prefix: '/api', ctx });
  app.register(cacheRoutes, { prefix: '/api', ctx });
  app.register(modelMixRoute, { prefix: '/api', ctx });
  app.register(settingsRoutes, { prefix: '/api', ctx });
  app.register(scanRoute, { prefix: '/api', ctx });
  return app;
}
```

- [ ] **Step 2: routes/health.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';

export async function healthRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/health', async () => {
    const r = opts.ctx.db.prepare(`SELECT COUNT(*) AS n FROM files`).get() as { n: number };
    const last = opts.ctx.db.prepare(`SELECT MAX(last_scanned_at) AS last FROM files`).get() as { last: string | null };
    return { ok: true, filesIndexed: r.n, lastScanAt: last.last };
  });
}
```

- [ ] **Step 3: Update index.ts to wire it all**

```ts
import { openDb } from './db/connection.js';
import { buildApi } from './api/server.js';
import { scanAll } from './scanner/scanner.js';
import { createWatcher } from './watcher/watcher.js';
import { DB_PATH, PROJECTS_DIR, PORT, HOST } from './config.js';

async function main() {
  const db = openDb(DB_PATH);
  console.log(`[boot] DB at ${DB_PATH}`);
  console.log(`[boot] Initial scan of ${PROJECTS_DIR}…`);
  const r = await scanAll(db, PROJECTS_DIR);
  console.log(`[boot] Scanned ${r.filesScanned} files (+${r.turnsInserted} turns, ${r.filesSkipped} skipped)`);

  const watcher = createWatcher(db, PROJECTS_DIR);
  watcher.start();

  const app = await buildApi({
    db,
    triggerScan: async () => {
      await scanAll(db, PROJECTS_DIR);
    },
  });
  await app.listen({ port: PORT, host: HOST });
  console.log(`[boot] Listening on http://${HOST}:${PORT}`);

  process.on('SIGTERM', async () => {
    await watcher.stop();
    await app.close();
    db.close();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: api.test.ts (initial)**

```ts
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { buildApi } from '../src/api/server.js';

describe('api/health', () => {
  it('responds with ok', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });
});
```

Note: this test will fail to compile until Tasks 3.2-3.6 stub their route exports. Quick fix: create the remaining route files with empty exports first.

- [ ] **Step 5: Stub remaining route files (so server.ts compiles)**

Create empty plugin shells for: `window.ts`, `projects.ts`, `sessions.ts`, `heatmap.ts`, `cache.ts`, `modelMix.ts`, `settings.ts`, `scan.ts`. Each:

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';

export async function windowRoute(
  _app: FastifyInstance,
  _opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  // filled in next task
}
```

Repeat with the matching exported name (`projectsRoutes`, `sessionRoute`, `heatmapRoute`, `cacheRoutes`, `modelMixRoute`, `settingsRoutes`, `scanRoute`).

- [ ] **Step 6: Run, commit**

```bash
npm test -w server
git add server/src/api/ server/src/index.ts server/tests/api.test.ts
git commit -m "feat(api): Fastify scaffold with health route + boot wiring"
```

---

### Task 3.2: window route

**Files:**
- Modify: `server/src/api/routes/window.ts`
- Modify: `server/tests/api.test.ts`

- [ ] **Step 1: Replace window.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';
import { fiveHourWindow } from '../../db/queries/window.js';
import { getSettings } from '../../db/queries/settings.js';

export async function windowRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/window', async () => {
    const w = fiveHourWindow(opts.ctx.db);
    const settings = getSettings(opts.ctx.db);
    const limit = settings.windowLimitTokens;
    const used = w.totalChargeable;
    const pct = Math.min(1, used / limit);
    const minsToLimit = w.burnRatePerMin > 0 ? Math.max(0, (limit - used) / w.burnRatePerMin) : null;
    return { ...w, limitTokens: limit, percentUsed: pct, minutesToLimit: minsToLimit };
  });
}
```

- [ ] **Step 2: Add api test**

Append to `server/tests/api.test.ts`:

```ts
describe('GET /api/window', () => {
  it('returns window stats with limit + projection', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const res = await app.inject({ method: 'GET', url: '/api/window' });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.limitTokens).toBeGreaterThan(0);
    expect(body.percentUsed).toBe(0);
    await app.close();
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npm test -w server
git add server/src/api/routes/window.ts server/tests/api.test.ts
git commit -m "feat(api): GET /api/window with limit + projection"
```

---

### Task 3.3: projects, sessions, heatmap, cache, modelMix routes

(Each follows the same pattern: tiny plugin reading from queries module.)

**Files:**
- Modify: `server/src/api/routes/projects.ts`
- Modify: `server/src/api/routes/sessions.ts`
- Modify: `server/src/api/routes/heatmap.ts`
- Modify: `server/src/api/routes/cache.ts`
- Modify: `server/src/api/routes/modelMix.ts`

- [ ] **Step 1: projects.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { listProjects, projectDetail } from '../../db/queries/projects.js';
import { getSettings } from '../../db/queries/settings.js';

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function projectsRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/projects', async () => {
    const settings = getSettings(opts.ctx.db);
    return { projects: listProjects(opts.ctx.db, settings.activeWithinDays) };
  });

  app.get('/projects/:id', async (req) => {
    const { id } = ParamsSchema.parse(req.params);
    return projectDetail(opts.ctx.db, decodeURIComponent(id));
  });
}
```

- [ ] **Step 2: sessions.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { turnsForSession } from '../../db/queries/turns.js';

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function sessionRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/sessions/:id', async (req) => {
    const { id } = ParamsSchema.parse(req.params);
    const session = opts.ctx.db
      .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
      .get(id);
    const subagents = opts.ctx.db
      .prepare(`SELECT session_id, primary_model, first_ts, last_ts, turn_count FROM sessions WHERE parent_session_id = ?`)
      .all(id);
    const turns = turnsForSession(opts.ctx.db, id);
    return { session, subagents, turns };
  });
}
```

- [ ] **Step 3: heatmap.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { heatmap } from '../../db/queries/heatmap.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function heatmapRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/heatmap', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, cells: heatmap(opts.ctx.db, days) };
  });
}
```

- [ ] **Step 4: cache.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { overallCacheScore, cacheScoreByProject } from '../../db/queries/cache.js';
import { getSettings } from '../../db/queries/settings.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });

export async function cacheRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/cache-effectiveness', async (req) => {
    const settings = getSettings(opts.ctx.db);
    const { days } = Q.parse(req.query);
    const d = days ?? settings.cacheScoreWindowDays;
    return {
      days: d,
      overall: overallCacheScore(opts.ctx.db, d),
      byProject: cacheScoreByProject(opts.ctx.db, d),
    };
  });
}
```

- [ ] **Step 5: modelMix.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { modelMixByProject } from '../../db/queries/modelMix.js';

const Q = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export async function modelMixRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/model-mix', async (req) => {
    const { days } = Q.parse(req.query);
    return { days, rows: modelMixByProject(opts.ctx.db, days) };
  });
}
```

- [ ] **Step 6: Run tests, commit**

```bash
npm test -w server
git add server/src/api/routes/{projects,sessions,heatmap,cache,modelMix}.ts
git commit -m "feat(api): projects/sessions/heatmap/cache/modelMix endpoints"
```

---

### Task 3.4: settings + scan routes

**Files:**
- Modify: `server/src/api/routes/settings.ts`
- Modify: `server/src/api/routes/scan.ts`

- [ ] **Step 1: settings.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import type { ApiContext } from '../server.js';
import { getSettings, updateSettings } from '../../db/queries/settings.js';

const Body = z.object({
  windowLimitTokens: z.number().int().positive().optional(),
  activeWithinDays: z.number().int().positive().optional(),
  cacheScoreWindowDays: z.number().int().positive().optional(),
});

export async function settingsRoutes(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.get('/settings', async () => getSettings(opts.ctx.db));
  app.post('/settings', async (req) => {
    const partial = Body.parse(req.body);
    return updateSettings(opts.ctx.db, partial);
  });
}
```

- [ ] **Step 2: scan.ts**

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { ApiContext } from '../server.js';

export async function scanRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { ctx: ApiContext },
) {
  app.post('/scan', async () => {
    await opts.ctx.triggerScan();
    return { ok: true };
  });
}
```

- [ ] **Step 3: Test settings round-trip**

Append:

```ts
describe('settings round-trip', () => {
  it('GET defaults, POST update, GET reflects', async () => {
    const db = openDb(':memory:');
    const app = await buildApi({ db, triggerScan: async () => {} });
    const def = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(def.windowLimitTokens).toBeGreaterThan(0);
    const post = await app.inject({ method: 'POST', url: '/api/settings', payload: { windowLimitTokens: 999_999 } });
    expect(post.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
    expect(after.windowLimitTokens).toBe(999_999);
    await app.close();
  });
});
```

- [ ] **Step 4: Run, commit**

```bash
npm test -w server
git add server/src/api/routes/settings.ts server/src/api/routes/scan.ts server/tests/api.test.ts
git commit -m "feat(api): settings GET/POST + manual scan trigger"
```

---

### Task 3.5: End-to-end smoke

- [ ] **Step 1: Build the server**

Run: `npm run build -w server`
Expected: clean compile.

- [ ] **Step 2: Have the user run `npm run dev -w server`** and verify:
  - Initial scan log line printed.
  - `curl http://127.0.0.1:8787/api/health` → `{"ok":true,...}`.
  - `curl http://127.0.0.1:8787/api/window` → real numbers.
  - `curl http://127.0.0.1:8787/api/projects | jq '.projects | length'` → > 0.

- [ ] **Step 3: If any endpoint 500s, fix the underlying query, add a regression test, commit.**

---

## Phase 4 — Frontend foundation

### Task 4.1: shadcn primitives + layout shell

**Files:**
- Create: `web/src/components/ui/button.tsx`
- Create: `web/src/components/ui/card.tsx`
- Create: `web/src/components/ui/badge.tsx`
- Create: `web/src/components/ui/skeleton.tsx`
- Create: `web/src/components/ui/tabs.tsx`
- Create: `web/src/components/ui/tooltip.tsx`
- Create: `web/src/components/layout/AppShell.tsx`
- Create: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/App.tsx`

The shadcn components below are the standard ones from shadcn/ui's repo. They're stable, small, and copy-paste.

- [ ] **Step 1: Add the shadcn primitives**

For each of `button`, `card`, `badge`, `skeleton`, `tabs`, `tooltip` — copy the latest source from https://ui.shadcn.com (or run `npx shadcn@latest add button card badge skeleton tabs tooltip` from `web/`). Each ends up at `web/src/components/ui/<name>.tsx`. They use `@/lib/utils` `cn()` already wired.

- [ ] **Step 2: Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r border-border bg-card/40 flex flex-col">
      <div className="px-4 py-5 border-b border-border">
        <h1 className="font-semibold tracking-tight">Claude Usage</h1>
        <p className="text-xs text-muted-foreground">v0.1</p>
      </div>
      <nav className="flex-1 py-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-2 text-sm rounded-md mx-2 my-1 transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                isActive && 'bg-accent text-foreground',
              )
            }
          >
            <it.icon className="size-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: AppShell.tsx**

```tsx
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Update App.tsx with router**

```tsx
import { Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { Projects } from '@/pages/Projects';
import { ProjectDetail } from '@/pages/ProjectDetail';
import { SessionDetail } from '@/pages/SessionDetail';
import { Settings } from '@/pages/Settings';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}
```

- [ ] **Step 5: Stub each page**

Create `Dashboard.tsx`, `Projects.tsx`, `ProjectDetail.tsx`, `SessionDetail.tsx`, `Settings.tsx` each as:

```tsx
export function Dashboard() {
  return <div><h2 className="text-xl font-semibold">Dashboard</h2></div>;
}
```

(Adjust the name per page. Stubs only.)

- [ ] **Step 6: User starts dev**

`npm run dev -w web` — verify navigation, dark theme, no console errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ web/src/pages/ web/src/App.tsx
git commit -m "feat(web): app shell + router + shadcn primitives"
```

---

### Task 4.2: API client + hooks

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/format.ts`
- Create: `web/src/hooks/useWindow.ts`
- Create: `web/src/hooks/useProjects.ts`
- Create: `web/src/hooks/useProject.ts`
- Create: `web/src/hooks/useSession.ts`
- Create: `web/src/hooks/useHeatmap.ts`
- Create: `web/src/hooks/useCacheScore.ts`
- Create: `web/src/hooks/useModelMix.ts`
- Create: `web/src/hooks/useSettings.ts`
- Create: `web/tests/format.test.ts`

- [ ] **Step 1: api.ts**

```ts
const BASE = '/api';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} ${res.status}`);
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: format.ts**

```ts
export function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function formatPercent(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatDuration(mins: number | null): string {
  if (mins === null || !Number.isFinite(mins)) return '—';
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
```

- [ ] **Step 3: format.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { formatTokens, formatPercent, formatRelative, formatDuration } from '../src/lib/format';

describe('format', () => {
  it('tokens', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(2_500_000)).toBe('2.50M');
  });

  it('percent', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.123, 1)).toBe('12.3%');
  });

  it('duration', () => {
    expect(formatDuration(0.5)).toBe('<1 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(125)).toBe('2h 5m');
  });

  it('relative', () => {
    expect(formatRelative(null)).toBe('—');
    expect(formatRelative(new Date().toISOString())).toBe('just now');
  });
});
```

- [ ] **Step 4: Hooks (one file per endpoint)**

`useWindow.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface WindowResponse {
  windowStart: string;
  windowEnd: string;
  totalChargeable: number;
  inputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  burnRatePerMin: number;
  limitTokens: number;
  percentUsed: number;
  minutesToLimit: number | null;
}

export function useWindow() {
  return useQuery({
    queryKey: ['window'],
    queryFn: () => api<WindowResponse>('/window'),
  });
}
```

`useProjects.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProjectRow {
  projectPath: string;
  projectName: string;
  sessionCount: number;
  totalTokens: number;
  lastTouched: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  isActive: boolean;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ projects: ProjectRow[] }>('/projects'),
  });
}
```

`useProject.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api<{ sessions: any[] }>(`/projects/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
}
```

`useSession.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => api<{ session: any; subagents: any[]; turns: any[] }>(`/sessions/${id}`),
    enabled: !!id,
  });
}
```

`useHeatmap.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface HeatCell {
  weekday: number;
  hour: number;
  tokens: number;
  sessionCount: number;
}

export function useHeatmap(days: number) {
  return useQuery({
    queryKey: ['heatmap', days],
    queryFn: () => api<{ days: number; cells: HeatCell[] }>(`/heatmap?days=${days}`),
  });
}
```

`useCacheScore.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CacheScore {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  effectiveness: number;
}

export interface CacheScoreByProject extends CacheScore {
  projectPath: string;
  projectName: string;
}

export function useCacheScore() {
  return useQuery({
    queryKey: ['cache'],
    queryFn: () => api<{ days: number; overall: CacheScore; byProject: CacheScoreByProject[] }>(`/cache-effectiveness`),
  });
}
```

`useModelMix.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ModelMixRow {
  projectPath: string;
  projectName: string;
  opusTokens: number;
  sonnetTokens: number;
  haikuTokens: number;
  otherTokens: number;
}

export function useModelMix(days: number) {
  return useQuery({
    queryKey: ['modelMix', days],
    queryFn: () => api<{ days: number; rows: ModelMixRow[] }>(`/model-mix?days=${days}`),
  });
}
```

`useSettings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Settings {
  windowLimitTokens: number;
  activeWithinDays: number;
  cacheScoreWindowDays: number;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partial: Partial<Settings>) =>
      api<Settings>('/settings', { method: 'POST', body: JSON.stringify(partial) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['window'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['cache'] });
    },
  });
}
```

- [ ] **Step 5: Run web tests, commit**

```bash
npm test -w web
git add web/src/lib/ web/src/hooks/ web/tests/
git commit -m "feat(web): API client, formatters, and TanStack Query hooks"
```

---

## Phase 5 — Widgets

### Task 5.1: WindowGauge

**Files:**
- Create: `web/src/components/widgets/WindowGauge.tsx`

- [ ] **Step 1: Write the widget**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWindow } from '@/hooks/useWindow';
import { formatDuration, formatPercent, formatTokens } from '@/lib/format';
import { RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis } from 'recharts';

export function WindowGauge() {
  const { data, isLoading } = useWindow();
  if (isLoading || !data) return <Skeleton className="h-72" />;

  const pct = Math.min(1, data.percentUsed);
  const color = pct > 0.85 ? 'hsl(0 70% 55%)' : pct > 0.6 ? 'hsl(38 90% 55%)' : 'hsl(160 70% 45%)';

  return (
    <Card>
      <CardHeader>
        <CardTitle>5-hour rolling window</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          <div className="size-48">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={[{ value: pct * 100, fill: color }]}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={10} background={{ fill: 'hsl(var(--muted))' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="-mt-32 text-center">
              <div className="text-3xl font-semibold tabular-nums">{formatPercent(pct)}</div>
              <div className="text-xs text-muted-foreground mt-1">of {formatTokens(data.limitTokens)}</div>
            </div>
          </div>
          <div className="space-y-3 flex-1">
            <Stat label="Used" value={formatTokens(data.totalChargeable)} />
            <Stat label="Burn rate" value={`${formatTokens(Math.round(data.burnRatePerMin))} / min`} />
            <Stat label="Limit ETA" value={formatDuration(data.minutesToLimit)} />
            <Stat label="Cache reads (free)" value={formatTokens(data.cacheReadTokens)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Drop into Dashboard.tsx**

```tsx
import { WindowGauge } from '@/components/widgets/WindowGauge';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
      <WindowGauge />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/widgets/WindowGauge.tsx web/src/pages/Dashboard.tsx
git commit -m "feat(web): WindowGauge widget"
```

---

### Task 5.2: CacheScore

**Files:**
- Create: `web/src/components/widgets/CacheScore.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Write CacheScore.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCacheScore } from '@/hooks/useCacheScore';
import { formatPercent, formatTokens } from '@/lib/format';
import { Link } from 'react-router-dom';

function tier(p: number): { label: string; className: string } {
  if (p >= 0.7) return { label: 'green', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  if (p >= 0.4) return { label: 'amber', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  return { label: 'red', className: 'bg-red-500/15 text-red-300 border-red-500/30' };
}

export function CacheScore() {
  const { data, isLoading } = useCacheScore();
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const t = tier(data.overall.effectiveness);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Cache effectiveness ({data.days}d)</CardTitle>
        <Badge variant="outline" className={t.className}>
          {formatPercent(data.overall.effectiveness, 1)}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-4">
          {formatTokens(data.overall.cacheReadTokens)} read /{' '}
          {formatTokens(data.overall.cacheCreationTokens)} created /{' '}
          {formatTokens(data.overall.inputTokens)} fresh
        </div>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs uppercase tracking-wide">
            <tr><th className="pb-2">Project</th><th className="pb-2 text-right">Score</th></tr>
          </thead>
          <tbody>
            {data.byProject.slice(0, 10).map((row) => {
              const tt = tier(row.effectiveness);
              return (
                <tr key={row.projectPath} className="border-t border-border">
                  <td className="py-2">
                    <Link to={`/projects/${encodeURIComponent(row.projectPath)}`} className="hover:underline">
                      {row.projectName}
                    </Link>
                  </td>
                  <td className="py-2 text-right">
                    <Badge variant="outline" className={tt.className}>
                      {formatPercent(row.effectiveness, 1)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add to dashboard**

```tsx
import { WindowGauge } from '@/components/widgets/WindowGauge';
import { CacheScore } from '@/components/widgets/CacheScore';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <WindowGauge />
        <CacheScore />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/widgets/CacheScore.tsx web/src/pages/Dashboard.tsx
git commit -m "feat(web): CacheScore widget"
```

---

### Task 5.3: ProjectLeaderboard

**Files:**
- Create: `web/src/components/widgets/ProjectLeaderboard.tsx`
- Modify: `web/src/pages/Projects.tsx`

- [ ] **Step 1: ProjectLeaderboard.tsx**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useProjects } from '@/hooks/useProjects';
import { formatRelative, formatTokens } from '@/lib/format';

type SortKey = 'lastTouched' | 'totalTokens' | 'sessionCount';

export function ProjectLeaderboard() {
  const { data, isLoading } = useProjects();
  const [sort, setSort] = useState<SortKey>('lastTouched');
  if (isLoading || !data) return <Skeleton className="h-96" />;

  const rows = [...data.projects].sort((a, b) => {
    if (sort === 'lastTouched') return b.lastTouched.localeCompare(a.lastTouched);
    if (sort === 'totalTokens') return b.totalTokens - a.totalTokens;
    return b.sessionCount - a.sessionCount;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <div className="flex gap-2 pt-2">
          {(['lastTouched', 'totalTokens', 'sessionCount'] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                sort === k ? 'bg-accent text-foreground border-border' : 'text-muted-foreground border-transparent hover:border-border'
              }`}
            >
              {k === 'lastTouched' ? 'Recent' : k === 'totalTokens' ? 'Tokens' : 'Sessions'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
            <tr>
              <th className="pb-2">Project</th>
              <th className="pb-2 text-right">Last touched</th>
              <th className="pb-2 text-right">Sessions</th>
              <th className="pb-2 text-right">Tokens (30d)</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.projectPath} className="border-t border-border">
                <td className="py-2">
                  <Link to={`/projects/${encodeURIComponent(p.projectPath)}`} className="hover:underline">
                    {p.projectName}
                  </Link>
                </td>
                <td className="py-2 text-right text-muted-foreground">{formatRelative(p.lastTouched)}</td>
                <td className="py-2 text-right tabular-nums">{p.sessionCount}</td>
                <td className="py-2 text-right tabular-nums">{formatTokens(p.totalTokens)}</td>
                <td className="py-2 text-right">
                  {p.isActive ? (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">idle</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Update Projects page**

```tsx
import { ProjectLeaderboard } from '@/components/widgets/ProjectLeaderboard';

export function Projects() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Projects</h2>
      <ProjectLeaderboard />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/widgets/ProjectLeaderboard.tsx web/src/pages/Projects.tsx
git commit -m "feat(web): ProjectLeaderboard with sort + active/idle badge"
```

---

### Task 5.4: ActivityHeatmap

**Files:**
- Create: `web/src/components/widgets/ActivityHeatmap.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: ActivityHeatmap.tsx**

```tsx
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useHeatmap } from '@/hooks/useHeatmap';
import { formatTokens } from '@/lib/format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActivityHeatmap() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useHeatmap(days);

  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const c of data?.cells ?? []) {
      g[c.weekday]![c.hour] = c.tokens;
      if (c.tokens > max) max = c.tokens;
    }
    return { g, max };
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-80" />;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Activity heatmap</CardTitle>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                days === d ? 'bg-accent text-foreground border-border' : 'text-muted-foreground border-transparent hover:border-border'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="text-[10px] tabular-nums">
            <thead>
              <tr>
                <th></th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="text-muted-foreground font-normal w-5 px-0.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.g.map((row, day) => (
                <tr key={day}>
                  <td className="text-muted-foreground pr-2 text-right">{DAYS[day]}</td>
                  {row.map((v, h) => {
                    const t = grid.max === 0 ? 0 : v / grid.max;
                    const bg = t === 0 ? 'hsl(var(--muted))' : `hsla(160, 70%, ${20 + t * 40}%, ${0.3 + t * 0.7})`;
                    return (
                      <td key={h} className="p-0">
                        <div
                          title={`${DAYS[day]} ${h}:00 — ${formatTokens(v)}`}
                          className="w-5 h-5 m-px rounded-sm"
                          style={{ background: bg }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add to Dashboard**

Update `Dashboard.tsx`:

```tsx
import { WindowGauge } from '@/components/widgets/WindowGauge';
import { CacheScore } from '@/components/widgets/CacheScore';
import { ActivityHeatmap } from '@/components/widgets/ActivityHeatmap';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <WindowGauge />
        <CacheScore />
      </div>
      <ActivityHeatmap />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/widgets/ActivityHeatmap.tsx web/src/pages/Dashboard.tsx
git commit -m "feat(web): ActivityHeatmap with 7/30/90d ranges"
```

---

### Task 5.5: ModelMix

**Files:**
- Create: `web/src/components/widgets/ModelMix.tsx`
- Modify: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: ModelMix.tsx**

```tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useModelMix } from '@/hooks/useModelMix';
import { formatTokens } from '@/lib/format';

export function ModelMix() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useModelMix(days);
  if (isLoading || !data) return <Skeleton className="h-96" />;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Model mix per project ({days}d)</CardTitle>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                days === d ? 'bg-accent text-foreground border-border' : 'text-muted-foreground border-transparent hover:border-border'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.rows.slice(0, 12).map((r) => {
          const total = r.opusTokens + r.sonnetTokens + r.haikuTokens + r.otherTokens;
          if (total === 0) return null;
          const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;
          return (
            <div key={r.projectPath} className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">{r.projectName}</span>
                <span className="tabular-nums">{formatTokens(total)}</span>
              </div>
              <div className="flex h-2 rounded overflow-hidden bg-muted">
                {r.opusTokens > 0 && <div title={`Opus ${pct(r.opusTokens)}`} style={{ width: pct(r.opusTokens), background: 'hsl(280 70% 60%)' }} />}
                {r.sonnetTokens > 0 && <div title={`Sonnet ${pct(r.sonnetTokens)}`} style={{ width: pct(r.sonnetTokens), background: 'hsl(210 80% 60%)' }} />}
                {r.haikuTokens > 0 && <div title={`Haiku ${pct(r.haikuTokens)}`} style={{ width: pct(r.haikuTokens), background: 'hsl(160 70% 50%)' }} />}
                {r.otherTokens > 0 && <div title={`Other ${pct(r.otherTokens)}`} style={{ width: pct(r.otherTokens), background: 'hsl(var(--muted-foreground))' }} />}
              </div>
            </div>
          );
        })}
        <div className="flex gap-4 pt-3 text-[10px] text-muted-foreground">
          <Legend color="hsl(280 70% 60%)" label="Opus" />
          <Legend color="hsl(210 80% 60%)" label="Sonnet" />
          <Legend color="hsl(160 70% 50%)" label="Haiku" />
          <Legend color="hsl(var(--muted-foreground))" label="Other" />
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Wire into Dashboard**

```tsx
import { ModelMix } from '@/components/widgets/ModelMix';
// ...
<div className="grid gap-6 lg:grid-cols-2">
  <ActivityHeatmap />
  <ModelMix />
</div>
```

(Reorganize so ActivityHeatmap and ModelMix sit side-by-side under the WindowGauge/CacheScore row.)

- [ ] **Step 3: Commit**

```bash
git add web/src/components/widgets/ModelMix.tsx web/src/pages/Dashboard.tsx
git commit -m "feat(web): ModelMix per-project stacked bars"
```

---

### Task 5.6: SubagentTree (session detail)

**Files:**
- Create: `web/src/components/widgets/SubagentTree.tsx`
- Modify: `web/src/pages/SessionDetail.tsx`

- [ ] **Step 1: SubagentTree.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useParams, Link } from 'react-router-dom';
import { useSession } from '@/hooks/useSession';
import { formatRelative, formatTokens } from '@/lib/format';

export function SubagentTree() {
  const { id } = useParams();
  const { data, isLoading } = useSession(id);
  if (isLoading || !data) return <Skeleton className="h-72" />;

  const total = data.turns.reduce(
    (acc: number, t: any) =>
      acc + t.input_tokens + t.output_tokens + t.cache_read_tokens + t.cache_creation_tokens,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session {id}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <Stat label="Project" value={data.session?.project_name ?? '—'} />
          <Stat label="Model" value={data.session?.primary_model ?? '—'} />
          <Stat label="Started" value={formatRelative(data.session?.first_ts)} />
          <Stat label="Last activity" value={formatRelative(data.session?.last_ts)} />
          <Stat label="Total turns" value={String(data.session?.turn_count ?? 0)} />
          <Stat label="Total tokens" value={formatTokens(total)} />
        </div>
        {data.subagents.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2 tracking-wide">
              Subagents ({data.subagents.length})
            </div>
            <ul className="space-y-1">
              {data.subagents.map((sa: any) => (
                <li key={sa.session_id} className="flex justify-between border-b border-border py-1">
                  <Link to={`/sessions/${sa.session_id}`} className="hover:underline truncate max-w-[60%]">
                    {sa.session_id}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">{sa.turn_count} turns • {sa.primary_model}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: SessionDetail.tsx**

```tsx
import { SubagentTree } from '@/components/widgets/SubagentTree';

export function SessionDetail() {
  return <SubagentTree />;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/widgets/SubagentTree.tsx web/src/pages/SessionDetail.tsx
git commit -m "feat(web): SubagentTree session detail view"
```

---

## Phase 6 — Project Detail + Settings pages

### Task 6.1: ProjectDetail page

**Files:**
- Modify: `web/src/pages/ProjectDetail.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject } from '@/hooks/useProject';
import { formatRelative } from '@/lib/format';

export function ProjectDetail() {
  const { id } = useParams();
  const decoded = id ? decodeURIComponent(id) : '';
  const { data, isLoading } = useProject(id);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/projects" className="text-sm text-muted-foreground hover:underline">← Projects</Link>
        <h2 className="text-2xl font-semibold tracking-tight mt-1">{decoded}</h2>
      </div>
      <Card>
        <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent>
          {isLoading || !data ? <Skeleton className="h-40" /> : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground text-left tracking-wide">
                <tr>
                  <th className="pb-2">Session</th>
                  <th className="pb-2">Model</th>
                  <th className="pb-2 text-right">Turns</th>
                  <th className="pb-2 text-right">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s: any) => (
                  <tr key={s.session_id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">
                      <Link to={`/sessions/${s.session_id}`} className="hover:underline">
                        {s.session_id.slice(0, 12)}…
                        {s.is_subagent ? <span className="ml-2 text-amber-400">↳ subagent</span> : null}
                      </Link>
                    </td>
                    <td className="py-2 text-muted-foreground">{s.primary_model ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{s.turn_count}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatRelative(s.last_ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/ProjectDetail.tsx
git commit -m "feat(web): ProjectDetail page with session list"
```

---

### Task 6.2: Settings page

**Files:**
- Modify: `web/src/pages/Settings.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';

export function Settings() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [windowLimit, setWindowLimit] = useState('');
  const [activeDays, setActiveDays] = useState('');
  const [cacheDays, setCacheDays] = useState('');

  useEffect(() => {
    if (data) {
      setWindowLimit(String(data.windowLimitTokens));
      setActiveDays(String(data.activeWithinDays));
      setCacheDays(String(data.cacheScoreWindowDays));
    }
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-72" />;

  function save() {
    update.mutate({
      windowLimitTokens: Number(windowLimit),
      activeWithinDays: Number(activeDays),
      cacheScoreWindowDays: Number(cacheDays),
    });
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      <Card>
        <CardHeader><CardTitle>Thresholds</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="5h window limit (chargeable tokens)">
            <input value={windowLimit} onChange={(e) => setWindowLimit(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full" />
          </Field>
          <Field label="Active project threshold (days)">
            <input value={activeDays} onChange={(e) => setActiveDays(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full" />
          </Field>
          <Field label="Cache score window (days)">
            <input value={cacheDays} onChange={(e) => setCacheDays(e.target.value)}
              className="bg-input rounded-md px-3 py-2 text-sm w-full" />
          </Field>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase text-muted-foreground tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Settings.tsx
git commit -m "feat(web): Settings page with threshold inputs"
```

---

## Phase 7 — Polish

### Task 7.1: README + scripts

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Expand README**

```markdown
# Claude Usage Dashboard

Local dashboard for Claude Code JSONL transcripts. Surfaces:

1. **5-hour rolling window gauge** — current burn + limit ETA.
2. **Cache effectiveness** — overall + per-project, color-coded.
3. **Subagent attribution** — parent/child token roll-up.
4. **Project leaderboard** — active vs idle.
5. **Activity heatmap** — when you actually code.
6. **Model mix per project** — Opus/Sonnet/Haiku/other split.

## Run

```bash
npm install
npm run dev   # starts server (8787) + web (5173) concurrently
```

The user starts and stops the dev server.

## Build / typecheck / test

```bash
npm run build
npm run typecheck
npm test
```

## Data

- Reads `~/.claude/projects/**/*.jsonl`.
- Stores aggregates in `~/.claude/usage-dashboard.db` (separate from phuryn's `~/.claude/usage.db`).
- Watches for file changes via chokidar; debounced re-scan.

## Configuration

Settings panel in the dashboard:
- 5h window limit (default 220k chargeable tokens; tune to your plan).
- Active-project threshold (default 14 days).
- Cache score window (default 7 days).

Settings persist in the SQLite `settings` table.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: full README"
```

---

### Task 7.2: Final QA

- [ ] **Step 1: Build everything**

Run: `npm run build`
Expected: clean compile across server + web.

- [ ] **Step 2: User runs `npm run dev` and walks through:**
  - Dashboard renders all four widgets without console errors.
  - Project leaderboard sortable, links to detail.
  - Project detail shows sessions, links to session detail.
  - Session detail shows subagents (pick a session that has them — you have many).
  - Settings save → window gauge updates limit number.
  - Heatmap toggles between 7d/30d/90d.

- [ ] **Step 3: Tag**

```bash
git tag v0.1.0
```

---

## Self-Review Notes

**Spec coverage:**
- 5h window gauge → Tasks 1.3, 3.2, 5.1 ✓
- Cache effectiveness → Tasks 1.3, 3.3, 5.2 ✓
- Subagent attribution → Tasks 2.2, 2.3, 3.3, 5.6 ✓
- Project leaderboard → Tasks 1.3, 3.3, 5.3 ✓
- Activity heatmap → Tasks 1.3, 3.3, 5.4 ✓
- Model mix → Tasks 1.3, 3.3, 5.5 ✓
- Settings persistence → Tasks 1.4, 3.4, 6.2 ✓
- API surface (all 9 endpoints) → Phase 3 ✓
- Schema (sessions, turns, files, settings) → Task 1.1 ✓
- File watcher → Task 2.4 ✓
- Subagent path detection → Task 2.2 ✓
- DB at `~/.claude/usage-dashboard.db` → `server/src/config.ts` ✓
- 500-line cap → enforced by file decomposition ✓

**Type consistency:** sessions/turns query method names + camelCase fields are consistent across all tasks. Hook return shapes match server route shapes.

**No placeholders:** every step has either runnable code or an exact command. No "implement later" / "similar to Task N".
