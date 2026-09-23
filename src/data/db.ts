import * as SQLite from 'expo-sqlite';
import type { Card, Category, Entry, InvoiceTotal, Paid, Recurring, RecurringOverride, Setting, Wallet } from './types';
import { palette } from '../theme';

export const db = SQLite.openDatabaseSync('lumen.db');

const SCHEMA_VERSION = 4;

export function migrate() {
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  db.withTransactionSync(() => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        kind TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        closing_day INTEGER NOT NULL,
        due_day INTEGER NOT NULL,
        limit_cents INTEGER,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        category_id INTEGER,
        date TEXT NOT NULL,
        method TEXT NOT NULL,
        card_id INTEGER,
        installments INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        invoice_month TEXT
      );
      CREATE TABLE IF NOT EXISTS recurrings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        category_id INTEGER,
        day INTEGER NOT NULL,
        method TEXT NOT NULL,
        card_id INTEGER,
        start_month TEXT NOT NULL,
        end_month TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recurring_overrides (
        recurring_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        amount_cents INTEGER,
        skipped INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (recurring_id, month)
      );
      CREATE TABLE IF NOT EXISTS paid (
        key TEXT PRIMARY KEY,
        paid_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS invoice_totals (
        card_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        notes TEXT,
        PRIMARY KEY (card_id, month)
      );
    `);
    if (version === 0) seedCategories();
    addColumnIfMissing('entries', 'invoice_month', 'TEXT');
    addColumnIfMissing('entries', 'wallet_id', 'INTEGER');
    addColumnIfMissing('recurrings', 'wallet_id', 'INTEGER');
    adoptOrphanWalletRows();
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/**
 * Antes dos vales serem cadastráveis existia um único "vale refeição" implícito.
 * Se sobrou algum lançamento assim, cria a carteira e adota os órfãos — ninguém
 * perde lançamento por causa da migração.
 */
function adoptOrphanWalletRows() {
  const orphans =
    (db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM entries WHERE method = 'vr' AND wallet_id IS NULL")?.n ?? 0) +
    (db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM recurrings WHERE method = 'vr' AND wallet_id IS NULL")?.n ?? 0);
  if (orphans === 0) return;
  const id = db.runSync(
    'INSERT INTO wallets (name, color, icon) VALUES (?, ?, ?)',
    'Vale refeição', '#2FA84F', 'silverware-fork-knife',
  ).lastInsertRowId;
  db.runSync("UPDATE entries SET wallet_id = ? WHERE method = 'vr' AND wallet_id IS NULL", id);
  db.runSync("UPDATE recurrings SET wallet_id = ? WHERE method = 'vr' AND wallet_id IS NULL", id);
}

/** Migração aditiva: só cria a coluna quando ela ainda não existe. */
function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (cols.some((c) => c.name === column)) return;
  db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

const DEFAULT_CATEGORIES: [string, string, 'expense' | 'income'][] = [
  ['Moradia', 'home-outline', 'expense'],
  ['Alimentação', 'food-outline', 'expense'],
  ['Mercado', 'cart-outline', 'expense'],
  ['Transporte', 'car-outline', 'expense'],
  ['Saúde', 'heart-pulse', 'expense'],
  ['Educação', 'school-outline', 'expense'],
  ['Lazer', 'gamepad-variant-outline', 'expense'],
  ['Assinaturas', 'play-box-multiple-outline', 'expense'],
  ['Contas & serviços', 'flash-outline', 'expense'],
  ['Compras', 'shopping-outline', 'expense'],
  ['Pets', 'paw-outline', 'expense'],
  ['Outros', 'dots-horizontal-circle-outline', 'expense'],
  ['Salário', 'briefcase-outline', 'income'],
  ['Freelance', 'laptop', 'income'],
  ['Investimentos', 'chart-line', 'income'],
  ['Outras receitas', 'cash-plus', 'income'],
];

function seedCategories() {
  let e = 0;
  let i = 0;
  for (const [name, icon, kind] of DEFAULT_CATEGORIES) {
    const color = kind === 'expense' ? palette[e++ % palette.length] : ['#2FA84F', '#3987E5', '#9085E9', '#4FB6C9'][i++ % 4];
    db.runSync('INSERT INTO categories (name, icon, color, kind) VALUES (?, ?, ?, ?)', name, icon, color, kind);
  }
}

export interface Snapshot {
  categories: Category[];
  cards: Card[];
  wallets: Wallet[];
  entries: Entry[];
  recurrings: Recurring[];
  overrides: RecurringOverride[];
  paid: Paid[];
  invoiceTotals: InvoiceTotal[];
  settings: Setting[];
}

export function loadAll(): Snapshot {
  return {
    categories: db.getAllSync<Category>('SELECT * FROM categories ORDER BY kind, name'),
    cards: db.getAllSync<Card>('SELECT * FROM cards ORDER BY name'),
    wallets: db.getAllSync<Wallet>('SELECT * FROM wallets ORDER BY name'),
    entries: db.getAllSync<Entry>('SELECT * FROM entries ORDER BY date DESC, id DESC'),
    recurrings: db.getAllSync<Recurring>('SELECT * FROM recurrings ORDER BY day, description'),
    overrides: db.getAllSync<RecurringOverride>('SELECT * FROM recurring_overrides'),
    paid: db.getAllSync<Paid>('SELECT * FROM paid'),
    invoiceTotals: db.getAllSync<InvoiceTotal>('SELECT * FROM invoice_totals'),
    settings: db.getAllSync<Setting>('SELECT * FROM settings'),
  };
}

const nowIso = () => new Date().toISOString();

// ---------- Categories ----------
export function saveCategory(c: Omit<Category, 'id' | 'archived'> & { id?: number }) {
  if (c.id) {
    db.runSync('UPDATE categories SET name=?, icon=?, color=?, kind=? WHERE id=?', c.name, c.icon, c.color, c.kind, c.id);
    return c.id;
  }
  return db.runSync('INSERT INTO categories (name, icon, color, kind) VALUES (?, ?, ?, ?)', c.name, c.icon, c.color, c.kind).lastInsertRowId;
}

export function deleteCategory(id: number) {
  const used =
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM entries WHERE category_id=?', id)?.n ?? 0) +
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM recurrings WHERE category_id=?', id)?.n ?? 0);
  if (used > 0) db.runSync('UPDATE categories SET archived=1 WHERE id=?', id);
  else db.runSync('DELETE FROM categories WHERE id=?', id);
}

// ---------- Cards ----------
export function saveCard(c: Omit<Card, 'id' | 'archived'> & { id?: number }) {
  if (c.id) {
    db.runSync('UPDATE cards SET name=?, color=?, closing_day=?, due_day=?, limit_cents=? WHERE id=?', c.name, c.color, c.closing_day, c.due_day, c.limit_cents, c.id);
    return c.id;
  }
  return db.runSync('INSERT INTO cards (name, color, closing_day, due_day, limit_cents) VALUES (?, ?, ?, ?, ?)', c.name, c.color, c.closing_day, c.due_day, c.limit_cents).lastInsertRowId;
}

// ---------- Vales (benefícios) ----------
export function saveWallet(w: Omit<Wallet, 'id' | 'archived'> & { id?: number }) {
  if (w.id) {
    db.runSync('UPDATE wallets SET name=?, color=?, icon=? WHERE id=?', w.name, w.color, w.icon, w.id);
    return w.id;
  }
  return db.runSync('INSERT INTO wallets (name, color, icon) VALUES (?, ?, ?)', w.name, w.color, w.icon).lastInsertRowId;
}

/** Some de vez só quando não tem lançamento; com histórico, vira arquivado. */
export function deleteWallet(id: number) {
  const used =
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM entries WHERE wallet_id=?', id)?.n ?? 0) +
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM recurrings WHERE wallet_id=?', id)?.n ?? 0);
  if (used > 0) db.runSync('UPDATE wallets SET archived=1 WHERE id=?', id);
  else db.runSync('DELETE FROM wallets WHERE id=?', id);
}

export function deleteCard(id: number) {
  const used =
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM entries WHERE card_id=?', id)?.n ?? 0) +
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM recurrings WHERE card_id=?', id)?.n ?? 0) +
    (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM invoice_totals WHERE card_id=?', id)?.n ?? 0);
  if (used > 0) db.runSync('UPDATE cards SET archived=1 WHERE id=?', id);
  else db.runSync('DELETE FROM cards WHERE id=?', id);
}

// ---------- Total da fatura informado manualmente ----------
export function setInvoiceTotal(cardId: number, month: string, amountCents: number, notes: string | null) {
  db.runSync(
    'INSERT INTO invoice_totals (card_id, month, amount_cents, notes) VALUES (?, ?, ?, ?) ON CONFLICT(card_id, month) DO UPDATE SET amount_cents=excluded.amount_cents, notes=excluded.notes',
    cardId, month, amountCents, notes,
  );
}

export function clearInvoiceTotal(cardId: number, month: string) {
  db.runSync('DELETE FROM invoice_totals WHERE card_id=? AND month=?', cardId, month);
}

// ---------- Entries ----------
export type EntryInput = Omit<Entry, 'id' | 'created_at'> & { id?: number };

export function saveEntry(e: EntryInput) {
  if (e.id) {
    db.runSync(
      'UPDATE entries SET kind=?, description=?, amount_cents=?, category_id=?, date=?, method=?, card_id=?, wallet_id=?, installments=?, notes=?, invoice_month=? WHERE id=?',
      e.kind, e.description, e.amount_cents, e.category_id, e.date, e.method, e.card_id, e.wallet_id ?? null, e.installments, e.notes, e.invoice_month ?? null, e.id,
    );
    return e.id;
  }
  return db.runSync(
    'INSERT INTO entries (kind, description, amount_cents, category_id, date, method, card_id, wallet_id, installments, notes, created_at, invoice_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    e.kind, e.description, e.amount_cents, e.category_id, e.date, e.method, e.card_id, e.wallet_id ?? null, e.installments, e.notes, nowIso(), e.invoice_month ?? null,
  ).lastInsertRowId;
}

export function deleteEntry(id: number) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM entries WHERE id=?', id);
    db.runSync("DELETE FROM paid WHERE key LIKE ?", `e:${id}:%`);
  });
}

// ---------- Recurrings ----------
export type RecurringInput = Omit<Recurring, 'id' | 'created_at'> & { id?: number };

export function saveRecurring(r: RecurringInput) {
  if (r.id) {
    db.runSync(
      'UPDATE recurrings SET kind=?, description=?, amount_cents=?, category_id=?, day=?, method=?, card_id=?, wallet_id=?, start_month=?, end_month=?, notes=? WHERE id=?',
      r.kind, r.description, r.amount_cents, r.category_id, r.day, r.method, r.card_id, r.wallet_id ?? null, r.start_month, r.end_month, r.notes, r.id,
    );
    return r.id;
  }
  return db.runSync(
    'INSERT INTO recurrings (kind, description, amount_cents, category_id, day, method, card_id, wallet_id, start_month, end_month, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    r.kind, r.description, r.amount_cents, r.category_id, r.day, r.method, r.card_id, r.wallet_id ?? null, r.start_month, r.end_month, r.notes, nowIso(),
  ).lastInsertRowId;
}

/**
 * Altera um recorrente só a partir de `fromMonth`: encerra o antigo no mês anterior
 * e cria um novo, levando junto ajustes e pagamentos dos meses seguintes.
 */
export function splitRecurring(oldId: number, fromMonth: string, prevMonth: string, next: RecurringInput) {
  let newId = 0;
  db.withTransactionSync(() => {
    db.runSync('UPDATE recurrings SET end_month=? WHERE id=?', prevMonth, oldId);
    newId = saveRecurring({ ...next, id: undefined, start_month: fromMonth });
    db.runSync('UPDATE recurring_overrides SET recurring_id=? WHERE recurring_id=? AND month >= ?', newId, oldId, fromMonth);
    const paid = db.getAllSync<Paid>('SELECT * FROM paid WHERE key LIKE ?', `r:${oldId}:%`);
    for (const p of paid) {
      const month = p.key.split(':')[2];
      if (month >= fromMonth) db.runSync('UPDATE paid SET key=? WHERE key=?', `r:${newId}:${month}`, p.key);
    }
  });
  return newId;
}

export function endRecurring(id: number, endMonth: string) {
  db.runSync('UPDATE recurrings SET end_month=? WHERE id=?', endMonth, id);
}

export function deleteRecurring(id: number) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM recurrings WHERE id=?', id);
    db.runSync('DELETE FROM recurring_overrides WHERE recurring_id=?', id);
    db.runSync('DELETE FROM paid WHERE key LIKE ?', `r:${id}:%`);
  });
}

export function setOverride(recurringId: number, month: string, amount: number | null, skipped: boolean) {
  db.runSync(
    'INSERT INTO recurring_overrides (recurring_id, month, amount_cents, skipped) VALUES (?, ?, ?, ?) ON CONFLICT(recurring_id, month) DO UPDATE SET amount_cents=excluded.amount_cents, skipped=excluded.skipped',
    recurringId, month, amount, skipped ? 1 : 0,
  );
}

export function clearOverride(recurringId: number, month: string) {
  db.runSync('DELETE FROM recurring_overrides WHERE recurring_id=? AND month=?', recurringId, month);
}

// ---------- Paid ----------
export function setPaid(key: string, paid: boolean) {
  if (paid) db.runSync('INSERT OR REPLACE INTO paid (key, paid_at) VALUES (?, ?)', key, nowIso());
  else db.runSync('DELETE FROM paid WHERE key=?', key);
}

// ---------- Preferências ----------
export function setSetting(key: string, value: string) {
  db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}

// ---------- Backup ----------
export function exportData() {
  return { app: 'lumen', version: SCHEMA_VERSION, exported_at: nowIso(), ...loadAll() };
}

const TABLES: { name: keyof Snapshot; table: string; cols: string[] }[] = [
  { name: 'categories', table: 'categories', cols: ['id', 'name', 'icon', 'color', 'kind', 'archived'] },
  { name: 'cards', table: 'cards', cols: ['id', 'name', 'color', 'closing_day', 'due_day', 'limit_cents', 'archived'] },
  { name: 'wallets', table: 'wallets', cols: ['id', 'name', 'color', 'icon', 'archived'] },
  { name: 'entries', table: 'entries', cols: ['id', 'kind', 'description', 'amount_cents', 'category_id', 'date', 'method', 'card_id', 'wallet_id', 'installments', 'notes', 'created_at', 'invoice_month'] },
  { name: 'recurrings', table: 'recurrings', cols: ['id', 'kind', 'description', 'amount_cents', 'category_id', 'day', 'method', 'card_id', 'wallet_id', 'start_month', 'end_month', 'notes', 'created_at'] },
  { name: 'overrides', table: 'recurring_overrides', cols: ['recurring_id', 'month', 'amount_cents', 'skipped'] },
  { name: 'paid', table: 'paid', cols: ['key', 'paid_at'] },
  { name: 'invoiceTotals', table: 'invoice_totals', cols: ['card_id', 'month', 'amount_cents', 'notes'] },
];

export function importData(data: any) {
  if (!data || data.app !== 'lumen' || !Array.isArray(data.categories)) {
    throw new Error('Arquivo de backup inválido.');
  }
  db.withTransactionSync(() => {
    for (const t of TABLES) {
      db.runSync(`DELETE FROM ${t.table}`);
      const rows: any[] = Array.isArray(data[t.name]) ? data[t.name] : [];
      const sql = `INSERT INTO ${t.table} (${t.cols.join(',')}) VALUES (${t.cols.map(() => '?').join(',')})`;
      for (const row of rows) db.runSync(sql, t.cols.map((c) => row[c] ?? null));
    }
    if (Array.isArray(data.settings)) {
      db.runSync('DELETE FROM settings');
      for (const row of data.settings as Setting[]) {
        if (row?.key != null) db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', row.key, String(row.value ?? ''));
      }
    }
  });
}

export function wipeAll() {
  db.withTransactionSync(() => {
    for (const t of TABLES) db.runSync(`DELETE FROM ${t.table}`);
    db.runSync("DELETE FROM sqlite_sequence");
    seedCategories();
  });
}
