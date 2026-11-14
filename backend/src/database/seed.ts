import { SEED_CURRENCIES } from '@im/shared/constants';
import type { SqliteLike } from './tx';

/** Données de référence idempotentes (devises initiales) ; jamais de données métier ici. */
export function seedReferenceData(sqlite: SqliteLike, now: string): void {
  const insert = sqlite.prepare('INSERT OR IGNORE INTO currencies (code, name, symbol, minor_units, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)');
  sqlite.transaction(() => {
    for (const c of SEED_CURRENCIES) insert.run(c.code, c.name, c.symbol, c.minorUnits, now);
  }).immediate();
}
