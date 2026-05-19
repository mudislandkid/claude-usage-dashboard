import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/connection.js';

describe('forecast_snapshots schema', () => {
  it('creates the forecast_snapshots table with expected columns', () => {
    const db = openDb(':memory:');
    const cols = db
      .prepare("PRAGMA table_info(forecast_snapshots)")
      .all() as Array<{ name: string; type: string; pk: number }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(
      ['by_hour_json', 'computed_ts', 'local_date', 'total_chargeable', 'window_days'].sort(),
    );
    expect(cols.find((c) => c.name === 'local_date')!.pk).toBe(1);
    db.close();
  });
});
