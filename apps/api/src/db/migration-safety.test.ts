import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every migration must be safe to run against a database that has already had
 * it — "compatible with all combinations" of applied state.
 *
 * This exists because `npm run db:migrate` loops over every file with
 * `|| exit 1`. Before this was enforced, 23 of the first 50 migrations used
 * bare `create table`, so running the script against an already-migrated
 * database died at 0001 with `relation "organizations" already exists` and
 * never reached the new migration at the end. The runner now tracks what has
 * been applied (see scripts/migrate.mjs), but that only helps when the runner
 * is used — a file re-run by hand, or replayed after a partial failure, still
 * has to be harmless.
 *
 * Existing files are grandfathered: retrofitting 50 historical migrations is a
 * separate, riskier change. Everything from GUARDED_FROM onward must comply.
 */
const MIGRATIONS_DIR = join(__dirname, '../../../../db/migrations');

/** The first migration required to be re-runnable. Never lower this. */
const GUARDED_FROM = 51;

interface Rule {
  name: string;
  /** Matches a statement that is NOT safe to re-run. */
  pattern: RegExp;
  fix: string;
  /**
   * Some statements have no `if not exists` form, so the safe version is a
   * preceding `drop ... if exists`. For those, `pattern` only finds candidates
   * and this decides whether each one is actually guarded.
   *
   * Without it the rule would reject the very pattern CLAUDE.md prescribes —
   * which is exactly what happened when 0052 became the first guarded
   * migration to create a policy.
   */
  isGuarded?: (sql: string, upToMatch: string, match: RegExpExecArray) => boolean;
}

/**
 * Builds an `isGuarded` for the drop-then-create shape: `create <kind> <name>
 * on <table>` is safe only if a matching `drop <kind> if exists <name> on
 * <table>` appears earlier in the same file. Order matters — dropping it
 * afterwards would delete what was just created.
 */
function guardedByPrecedingDrop(kind: 'policy' | 'trigger') {
  return (_sql: string, upToMatch: string, match: RegExpExecArray): boolean => {
    const [, name, table] = match;
    if (!name || !table) return false;
    const drop = new RegExp(
      `\\bdrop\\s+${kind}\\s+if\\s+exists\\s+${name}\\s+on\\s+${table}\\b`,
      'i',
    );
    return drop.test(upToMatch);
  };
}

/** All the places a rule's pattern fires, with the text preceding each one. */
function violationsOf(rule: Rule, sql: string): boolean {
  const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g')
    ? rule.pattern.flags
    : `${rule.pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(sql)) !== null) {
    if (!rule.isGuarded) return true;
    if (!rule.isGuarded(sql, sql.slice(0, match.index), match)) return true;
  }
  return false;
}

const RULES: Rule[] = [
  {
    name: 'create table',
    pattern: /\bcreate\s+table\s+(?!if\s+not\s+exists)/i,
    fix: 'use `create table if not exists`',
  },
  {
    name: 'create index',
    pattern: /\bcreate\s+(unique\s+)?index\s+(?!if\s+not\s+exists|concurrently\s+if\s+not\s+exists)/i,
    fix: 'use `create index if not exists` (or `create unique index if not exists`)',
  },
  {
    name: 'add column',
    pattern: /\badd\s+column\s+(?!if\s+not\s+exists)/i,
    fix: 'use `add column if not exists`',
  },
  {
    name: 'drop column',
    pattern: /\bdrop\s+column\s+(?!if\s+exists)/i,
    fix: 'use `drop column if exists`',
  },
  {
    name: 'create type',
    pattern: /\bcreate\s+type\s+/i,
    fix: 'Postgres has no `create type if not exists` — wrap it in a `do $$ ... exception when duplicate_object then null; end $$;` block',
  },
  {
    name: 'create policy',
    pattern: /\bcreate\s+policy\s+(\w+)\s+on\s+([\w.]+)/i,
    fix: 'Postgres has no `create policy if not exists` — precede it with `drop policy if exists <name> on <table>;`',
    isGuarded: guardedByPrecedingDrop('policy'),
  },
  {
    name: 'create function',
    pattern: /\bcreate\s+function\s+/i,
    fix: 'use `create or replace function`',
  },
  {
    name: 'create view',
    pattern: /\bcreate\s+view\s+/i,
    fix: 'use `create or replace view`',
  },
  {
    name: 'create trigger',
    pattern: /\bcreate\s+trigger\s+(\w+)[\s\S]*?\bon\s+([\w.]+)/i,
    fix: 'Postgres has no `create trigger if not exists` — precede it with `drop trigger if exists <name> on <table>;`',
    isGuarded: guardedByPrecedingDrop('trigger'),
  },
];

/** Strips comments and string literals so their contents never trip a rule. */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' $$BODY$$ ')
    .replace(/'(?:[^']|'')*'/g, "'…'");
}

function migrationNumber(filename: string): number {
  return Number(filename.slice(0, 4));
}

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const guarded = files.filter((f) => migrationNumber(f) >= GUARDED_FROM);

describe('migration safety', () => {
  it('finds the migrations directory', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => /^\d{4}_/.test(f))).toBe(true);
  });

  it('numbers every migration uniquely, so ordering is unambiguous', () => {
    const numbers = files.map(migrationNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  // The real gate. Parameterised so a failure names the offending file and rule.
  it.each(guarded.length ? guarded : ['(no migrations at or past the guard yet)'])(
    '%s is safe to re-run against a database that already has it',
    (filename) => {
      if (!filename.endsWith('.sql')) return;
      const sql = stripNoise(readFileSync(join(MIGRATIONS_DIR, filename), 'utf8'));
      const violations = RULES
        .filter((rule) => violationsOf(rule, sql))
        .map((rule) => `  • ${rule.name} — ${rule.fix}`);
      expect(violations.join('\n'), `${filename} has statements that would fail on a second run:\n${violations.join('\n')}`).toBe('');
    },
  );
});

describe('the rules themselves', () => {
  const violates = (name: string, sql: string) =>
    violationsOf(RULES.find((r) => r.name === name)!, stripNoise(sql));

  it('flags an unguarded create table but accepts the guarded form', () => {
    expect(violates('create table', 'create table foo (id uuid);')).toBe(true);
    expect(violates('create table', 'create table if not exists foo (id uuid);')).toBe(false);
  });

  it('flags an unguarded index, including the unique variant', () => {
    expect(violates('create index', 'create index idx_a on t (c);')).toBe(true);
    expect(violates('create index', 'create unique index idx_a on t (c);')).toBe(true);
    expect(violates('create index', 'create index if not exists idx_a on t (c);')).toBe(false);
    expect(violates('create index', 'create unique index if not exists idx_a on t (c);')).toBe(false);
  });

  it('flags an unguarded add column but accepts the guarded form', () => {
    expect(violates('add column', 'alter table t add column c boolean;')).toBe(true);
    expect(violates('add column', 'alter table t add column if not exists c boolean;')).toBe(false);
  });

  it('flags a bare create policy but accepts one guarded by a preceding drop', () => {
    expect(violates('create policy', 'create policy p on t using (true);')).toBe(true);
    expect(violates('create policy',
      'drop policy if exists p on t;\ncreate policy p on t using (true);')).toBe(false);
  });

  it('does not accept a drop that names a different policy or table', () => {
    expect(violates('create policy',
      'drop policy if exists other on t;\ncreate policy p on t using (true);')).toBe(true);
    expect(violates('create policy',
      'drop policy if exists p on other_table;\ncreate policy p on t using (true);')).toBe(true);
  });

  it('rejects a drop that comes after the create — order is what makes it safe', () => {
    expect(violates('create policy',
      'create policy p on t using (true);\ndrop policy if exists p on t;')).toBe(true);
  });

  it('checks every policy in a file, not just the first', () => {
    expect(violates('create policy',
      'drop policy if exists a on t;\ncreate policy a on t using (true);\ncreate policy b on t using (true);')).toBe(true);
  });

  it('flags a bare create trigger but accepts one guarded by a preceding drop', () => {
    expect(violates('create trigger', 'create trigger tg before insert on t execute function f();')).toBe(true);
    expect(violates('create trigger',
      'drop trigger if exists tg on t;\ncreate trigger tg before insert on t execute function f();')).toBe(false);
  });

  it('flags create function but accepts create or replace', () => {
    expect(violates('create function', 'create function f() returns int as $$ select 1 $$ language sql;')).toBe(true);
    expect(violates('create function', 'create or replace function f() returns int as $$ select 1 $$ language sql;')).toBe(false);
  });

  it('ignores statements that only appear inside comments', () => {
    expect(violates('create table', '-- create table foo (id uuid);')).toBe(false);
    expect(violates('create table', '/* create table foo (id uuid); */')).toBe(false);
  });

  it('leaves genuinely idempotent statements alone', () => {
    const alwaysSafe = 'alter table t enable row level security;\ncomment on column t.c is \'note\';\nupdate t set c = true;';
    expect(RULES.some((r) => r.pattern.test(stripNoise(alwaysSafe)))).toBe(false);
  });
});
