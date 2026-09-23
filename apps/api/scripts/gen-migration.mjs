/**
 * Generates the next Drizzle migration WITHOUT interactive rename prompts —
 * and WITHOUT guessing.
 *
 * PRODUCT/OPERATIONS INVARIANT (decided at Phase 3, pre-production):
 * this script must never silently interpret an ambiguous drizzle-kit rename
 * question as drop+create once real data exists. Ambiguity is a human decision.
 *
 * Behavior:
 * - A prompt only opens when drizzle-kit GUESSES a column/table rename
 *   (created + deleted columns in the same table diff). The prompt itself is
 *   the ambiguity signal.
 * - The first time a prompt opens, this script records the ambiguity, then
 *   ABORTS generation with a clear message and exit code 2. NOTHING is written
 *   — no migration file, no snapshot, no journal entry.
 * - The developer then resolves the ambiguity deliberately:
 *     a) rename it intentionally in the schema (preferred: drizzle _meta
 *        columns/internal annotations), or
 *     b) confirm drop+create is correct (e.g. column repurposed, dev data only)
 *        and pass --allow-destructive=<table.column>[,<table.column>] to accept
 *        exactly those columns' drop+create.
 *   With --allow-destructive, the prompt is answered "create column" ONLY for
 *   the explicitly listed columns; any OTHER prompt still aborts.
 *
 * The generated SQL must ALWAYS be reviewed by a human before commit,
 * regardless of flags.
 *
 * Usage:
 *   node scripts/gen-migration.mjs <migration_name>
 *   node scripts/gen-migration.mjs <migration_name> --allow-destructive=tags.owner_id
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

const args = process.argv.slice(2);
const name = args[0];
const destructiveFlag = args.find((a) => a.startsWith('--allow-destructive='));
const allowedDestructive = new Set(
  destructiveFlag ? destructiveFlag.split('=')[1].split(',').map((s) => s.trim()) : []
);

if (!name || !/^[a-z0-9_]+$/i.test(name)) {
  console.error('Usage: node scripts/gen-migration.mjs <migration_name> [--allow-destructive=table.column,...]');
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

// 2. Wrap readline.createInterface so a hanji prompt resolves with the default
//    ("create column" — NO rename). Default-safe: only prompts for columns the
//    developer explicitly allow-listed resolve; anything else aborts the run.
const origCreateInterface = readline.createInterface;
const timers = [];
let ambiguousColumns = []; // filled as prompts fire
let aborted = false;

try {
  readline.createInterface = function patched(options) {
    const rl = origCreateInterface.apply(this, arguments);
    const stdin = options?.input ?? process.stdin;
    let presses = 0;
    const timer = setInterval(() => {
      presses += 1;
      // hanji attaches its keypress listener synchronously after
      // createInterface; by the second tick the prompt is live and its view
      // exposes the item being resolved.
      if (presses < 2) return;
      clearInterval(timer);
      const tableName = rl?.view?.tableName ?? rl?.view?.name ?? '(unknown table)';
      const columnName = rl?.view?.created?.name ?? rl?.view?.data?.to?.name ?? '(unknown column)';
      const key = `${tableName}.${columnName}`;
      if (allowedDestructive.has(key)) {
        console.error(`[gen] allowing explicit drop+create for ${key} (--allow-destructive)`);
        stdin.emit('keypress', '\r', { name: 'return' });
      } else {
        ambiguousColumns.push(key);
        aborted = true;
        // Abort the prompt itself so drizzle-kit unwinds instead of hanging.
        stdin.emit('keypress', '', { name: 'escape', ctrl: false });
      }
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
  console.error('[gen] diffing snapshots (ambiguous renames abort)...');
  let statements;
  try {
    statements = await kit.generateMySQLMigration(prevSnapshot, curSnapshot);
  } catch (err) {
    // An aborted hanji prompt surfaces as an error or process exit inside the
    // kit; translate it into our explicit ambiguity message below.
    if (aborted) statements = null;
    else throw err;
  }
  for (const t of timers) clearInterval(t);

  if (aborted) {
    console.error('');
    console.error('════════════════════════════════════════════════════════════');
    console.error('AMBIGUOUS SCHEMA CHANGE — MIGRATION NOT GENERATED.');
    console.error('');
    console.error('drizzle-kit detected possible renames and asked for a decision.');
    console.error('This script refuses to guess (drop+create destroys data).');
    console.error('');
    console.error('Ambiguous at:');
    for (const key of ambiguousColumns) console.error(`  - ${key}`);
    console.error('');
    console.error('Resolve deliberately, then re-run:');
    console.error('  a) If it IS a rename: encode the rename in the schema/meta and');
    console.error('     regenerate so drizzle-kit emits ALTER ... RENAME.');
    console.error('  b) If drop+create is genuinely correct (data disposable), re-run with:');
    console.error(`     --allow-destructive=${ambiguousColumns.join(',')}`);
    console.error('════════════════════════════════════════════════════════════');
    process.exit(2);
  }
  if (aborted === false && ambiguousColumns.length > 0) {
    // Prompts fired but generation completed — only possible when all were
    // explicitly allow-listed.
    console.error(`[gen] ${ambiguousColumns.length} destructive column change(s) allowed explicitly.`);
  }

  console.error('[gen] diff complete');

  if (statements === null || statements.length === 0) {
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
  console.error('');
  console.error('REVIEW THE GENERATED SQL BEFORE COMMITTING — this is a hard rule.');
} finally {
  readline.createInterface = origCreateInterface;
  for (const t of timers) clearInterval(t);
}
