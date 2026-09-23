/**
 * Generates the next Drizzle migration WITHOUT interactive rename prompts.
 *
 * drizzle-kit 0.28 opens an interactive hanji select prompt whenever it
 * *guesses* a column was renamed (e.g. tags.owner_id -> tags.project_id).
 * Under CI/agents that prompt consumes stdin forever. Drizzle exposes no
 * --force flag.
 *
 * Strategy: hanji lazily requires('readline') and calls createInterface at
 * prompt time. We temporarily wrap readline.createInterface so that, whenever
 * a prompt terminal opens, a synthetic Enter keypress is emitted on stdin at
 * short intervals until the prompt resolves with the default option ("create
 * column" — i.e. NO rename). The first press resolves; the rest are no-ops.
 *
 * Drop+create (no rename) is the correct semantics for this project:
 * pre-production dev data only, and owner_id -> project_id on tags is not a
 * data-preserving rename anyway.
 *
 * Usage: node scripts/gen-migration.mjs <migration_name>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import readline from 'node:readline';

const require = createRequire(import.meta.url);

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(apiDir, 'drizzle');
const metaDir = join(outDir, 'meta');
const journalPath = join(metaDir, '_journal.json');

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/i.test(name)) {
  console.error('Usage: node scripts/gen-migration.mjs <migration_name>');
  process.exit(1);
}

// 1. Previous snapshot from the journal chain.
const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const lastEntry = journal.entries[journal.entries.length - 1];
if (!lastEntry) {
  console.error('No previous migration found in journal — refusing to bootstrap from here.');
  process.exit(1);
}
const prevSnapshotPath = existsSync(join(metaDir, `${lastEntry.tag}.json`))
  ? join(metaDir, `${lastEntry.tag}.json`)
  : join(metaDir, '0000_snapshot.json'); // drizzle-kit names the first snapshot 0000_snapshot.json
const prevSnapshot = JSON.parse(readFileSync(prevSnapshotPath, 'utf8'));

// 2. Wrap readline.createInterface: every new hanji prompt terminal gets a
//    steady stream of synthetic Enter presses on its stdin.
const origCreateInterface = readline.createInterface;
const timers = [];
try {
  readline.createInterface = function patched(options) {
    const rl = origCreateInterface.apply(this, arguments);
    const stdin = options?.input ?? process.stdin;
    const timer = setInterval(() => {
      stdin.emit('keypress', '\r', { name: 'return' });
    }, 50);
    timer.unref?.();
    timers.push(timer);
    return rl;
  };

  // 3. Load the drizzle-kit API bundle.
  const kitPath = join(apiDir, '..', '..', 'node_modules', 'drizzle-kit', 'api.js');
  const kit = require(kitPath);
  if (
    typeof kit.generateMySQLMigration !== 'function' ||
    typeof kit.generateMySQLDrizzleJson !== 'function'
  ) {
    console.error('Expected drizzle-kit API functions not found in api.js');
    process.exit(1);
  }

  // 4. Build the current snapshot from the live schema file (tsx ESM loader).
  const { register } = await import('tsx/esm/api');
  const unregister = register();
  const schemaUrl = new URL('file://' + join(apiDir, 'src', 'db', 'schema.ts')).href;
  const schemaModule = await import(schemaUrl);
  unregister();

  const tableExports = Object.fromEntries(
    Object.entries(schemaModule).filter(
      ([, v]) => v && typeof v === 'object' && Symbol.for('drizzle:Name') in v
    )
  );
  if (Object.keys(tableExports).length === 0) {
    console.error('No drizzle table exports found in schema.ts');
    process.exit(1);
  }
  console.error('[gen] building current snapshot...');
  const curSnapshot = await kit.generateMySQLDrizzleJson(tableExports);
  console.error('[gen] diffing snapshots (rename prompts auto-answered)...');
  const statements = await kit.generateMySQLMigration(prevSnapshot, curSnapshot);
  console.error('[gen] diff complete');

  if (statements.length === 0) {
    console.log('No schema changes detected; nothing to generate.');
    process.exit(0);
  }

  // 5. Write migration file + snapshot + journal entry (drizzle-kit layout).
  // Drizzle's migrator splits on the "--> statement-breakpoint" marker.
  const seq = String(journal.entries.length).padStart(4, '0');
  const tag = `${seq}_${name}`;
  const sql = statements.join('\n--> statement-breakpoint\n');
  writeFileSync(join(outDir, `${tag}.sql`), `${sql}\n`);

  const newId = crypto.randomUUID().replaceAll('-', '').slice(0, 27);
  const curSnapshotOut = {
    id: newId,
    prevId: prevSnapshot.id,
    version: curSnapshot.version,
    dialect: curSnapshot.dialect,
    tables: curSnapshot.tables,
    views: curSnapshot.views ?? {},
    _meta: curSnapshot._meta ?? { tables: {}, columns: {} },
  };
  writeFileSync(join(metaDir, `${tag}.json`), JSON.stringify(curSnapshotOut, null, 2) + '\n');

  journal.entries.push({
    idx: journal.entries.length,
    version: '6',
    when: Date.now(),
    tag,
    breakpoints: true,
  });
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');

  console.log(`Generated drizzle/${tag}.sql (${statements.length} statements)`);
  console.log(sql);
} finally {
  readline.createInterface = origCreateInterface;
  for (const t of timers) clearInterval(t);
}
