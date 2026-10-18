import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import type { D1Database } from '../functions/api/tasks.ts';

/** SQLite adapter used by the dev server and API tests, executing the real D1 SQL. */
export function localDatabase(filename: string): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    if (sqlite.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(fs.readFileSync(new URL(name, directory), 'utf8'));
      sqlite.prepare('INSERT INTO schema_migrations VALUES (?)').run(name);
      sqlite.exec('COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
  const db: D1Database = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let parameters: Record<string, SQLInputValue> = {};
      const prepared = {
        bind(...values: unknown[]) {
          parameters = Object.fromEntries(values.map((value, i) => [String(i + 1), value as SQLInputValue]));
          return prepared;
        },
        async first<T>() { return (statement.get(parameters) ?? null) as T | null; },
        async run() { return statement.run(parameters); },
      };
      return prepared;
    },
  };
  return { db, sqlite };
}
