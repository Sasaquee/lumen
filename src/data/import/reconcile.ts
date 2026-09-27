import type { Card, Category, Entry } from '../types';
import type { EntryInput } from '../db';
import type { Item } from '../engine';
import { entryOffset, entryParcel } from '../engine';
import type { ParsedLine } from './types';
import { similarity } from './text';
import { guessCategory } from './categorize';
import { addMonths, daysBetween, monthDiff } from '../../utils/dates';

export type ImportSource = 'csv' | 'print';

/** O que o app faria com cada linha lida. */
export interface Proposal {
  id: string;
  line: ParsedLine;
  /**
   * `new`: ainda não existe. `kept`: igual a um lançamento já importado.
   * `changed`: é a mesma compra, mas com outro valor — o antigo é trocado.
   */
  status: 'new' | 'kept' | 'changed';
  /** Lançamento importado antes que corresponde a esta linha. */
  matchId?: number;
  /** Parcela (0-based) do lançamento existente que cai neste mês. */
  matchIndex?: number;
  matchAmount?: number;
  /**
   * Diferença de poucos centavos entre um mês e outro da mesma parcela: é arredondamento
   * do banco (25,90 numa, 25,91 na outra). Ajusta sem pedir confirmação.
   */
  rounding?: boolean;
  /** Parece algo que você lançou à mão ou um fixo do cartão: por padrão não entra. */
  conflict?: string;
  include: boolean;
  categoryId: number | null;
  description: string;
}

/** Lançamento importado antes que não veio desta vez. */
export interface Removal {
  entryId: number;
  description: string;
  amount: number;
  installment?: { index: number; total: number };
}

export interface ImportPlan {
  proposals: Proposal[];
  removed: Removal[];
  /** Já havia importação neste mês: a nova precisa de confirmação. */
  hadImport: boolean;
  payments: ParsedLine[];
}

/** Uma compra importada vista do mês da fatura: qual parcela cai nele. */
interface Existing {
  e: Entry;
  k: number;
  n: number;
  firstMonth: string;
  amount: number;
}

/** Até quantos centavos uma diferença na mesma parcela é só arredondamento. */
export const ROUNDING_CENTS = 3;

const near = (a: number, b: number, pct: number) => Math.abs(a - b) <= Math.max(2, Math.abs(b) * pct);

/**
 * Compara o que foi lido com o que o app já tem na fatura.
 *
 * Uma compra parcelada é reconhecida pela fatura em que começou (mês da fatura menos a
 * parcela), pelo número de parcelas e pelo valor — assim a "Parcela 3/4" do mês que
 * vem casa com a "2/4" importada hoje, e nada duplica. A descrição só desempata, porque
 * o OCR e os bancos a escrevem de jeitos diferentes.
 */
export function planImport(p: {
  lines: ParsedLine[];
  card: Card;
  month: string;
  entries: Entry[];
  invoiceItems: Item[];
  categories: Category[];
  entryInvoiceMonth: (e: Entry) => string;
}): ImportPlan {
  const { card, month } = p;
  const existing: Existing[] = [];
  for (const e of p.entries) {
    if (e.kind !== 'expense' || e.method !== 'cartao' || e.card_id !== card.id || !e.import_source) continue;
    const first = p.entryInvoiceMonth(e);
    const n = Math.max(1, e.installments);
    const k = monthDiff(first, month);
    if (k < entryOffset(e) || k >= n) continue;
    existing.push({ e, k, n, firstMonth: first, amount: entryParcel(e, k) });
  }

  const used = new Set<number>();
  const proposals: Proposal[] = [];
  const payments: ParsedLine[] = [];

  p.lines.forEach((line, i) => {
    if (line.type === 'payment') { payments.push(line); return; }
    const n = line.installment?.total ?? 1;
    const x = line.installment?.index ?? 1;
    const firstMonth = addMonths(month, -(x - 1));
    let best: { ex: Existing; score: number } | undefined;
    for (const ex of existing) {
      if (used.has(ex.e.id) || ex.n !== n) continue;
      if (n > 1 && ex.firstMonth !== firstMonth) continue;
      if (Math.sign(ex.amount) !== Math.sign(line.amount)) continue;
      const sim = similarity(line.description, ex.e.description);
      const same = ex.amount === line.amount;
      const closeDate = n > 1 || Math.abs(daysBetween(ex.e.date, line.date)) <= 3;
      const ok = n > 1
        ? (same && sim >= 0.2) || (near(ex.amount, line.amount, 0.05) && sim >= 0.45)
        : closeDate && ((same && sim >= 0.3) || (near(ex.amount, line.amount, 0.05) && sim >= 0.6));
      if (!ok) continue;
      const score = (same ? 2 : 0) + sim + (ex.e.date === line.date ? 0.5 : 0);
      if (!best || score > best.score) best = { ex, score };
    }
    const id = `l${i}`;
    if (best) {
      used.add(best.ex.e.id);
      proposals.push({
        id, line,
        status: best.ex.amount === line.amount ? 'kept' : 'changed',
        rounding: best.ex.amount !== line.amount && Math.abs(best.ex.amount - line.amount) <= ROUNDING_CENTS,
        matchId: best.ex.e.id,
        matchIndex: best.ex.k,
        matchAmount: best.ex.amount,
        include: true,
        categoryId: best.ex.e.category_id,
        description: best.ex.e.description,
      });
      return;
    }
    proposals.push({
      id, line,
      status: 'new',
      include: true,
      categoryId: guessCategory(line.raw, p.categories),
      description: line.description,
    });
  });

  // novas que parecem algo lançado à mão ou um fixo do cartão ficam de fora por padrão
  const manual = p.invoiceItems.filter((it) => it.entryId != null && !p.entries.find((e) => e.id === it.entryId)?.import_source);
  const fixed = p.invoiceItems.filter((it) => it.source === 'recurring');
  const taken = new Set<string>();
  for (const pr of proposals) {
    if (pr.status !== 'new') continue;
    const hit =
      manual.find((it) => !taken.has(it.key) && (it.amount === pr.line.amount || (similarity(it.description, pr.line.raw) >= 0.5 && near(it.amount, pr.line.amount, 0.1)))) ??
      fixed.find((it) => !taken.has(it.key) && near(it.amount, pr.line.amount, 0.1) && (it.amount === pr.line.amount || similarity(it.description, pr.line.raw) >= 0.3));
    if (!hit) continue;
    taken.add(hit.key);
    pr.include = false;
    pr.conflict = hit.source === 'recurring'
      ? `Parece o fixo mensal "${hit.description}", que já está nesta fatura.`
      : `Parece "${hit.description}", que você já lançou à mão.`;
  }

  const removed: Removal[] = existing
    .filter((ex) => !used.has(ex.e.id))
    .map((ex) => ({
      entryId: ex.e.id,
      description: ex.e.description,
      amount: ex.amount,
      installment: ex.n > 1 ? { index: ex.k + 1, total: ex.n } : undefined,
    }));

  return { proposals, removed, hadImport: existing.length > 0, payments };
}

/**
 * Valores de todas as parcelas de uma compra com a parcela `k` trocada. É assim que um
 * mês que veio com outro valor ajusta só ele, sem mexer nas outras faturas.
 */
export function parcelsWith(e: Entry, k: number, amount: number): number[] {
  const n = Math.max(1, e.installments);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i === k ? amount : entryParcel(e, i));
  return out;
}

/** Lançamento a gravar para uma linha nova. */
export function entryFor(pr: Proposal, card: Card, month: string, source: ImportSource): EntryInput {
  const n = pr.line.installment?.total ?? 1;
  const x = pr.line.installment?.index ?? 1;
  return {
    kind: 'expense',
    description: pr.description.trim() || pr.line.description,
    amount_cents: pr.line.amount * n,
    category_id: pr.categoryId,
    date: pr.line.date,
    method: 'cartao',
    card_id: card.id,
    wallet_id: null,
    installments: n,
    notes: null,
    // a compra começa na fatura da 1ª parcela; as que já passaram ficam de fora
    invoice_month: addMonths(month, -(x - 1)),
    installment_offset: x - 1,
    installment_amounts: null,
    import_source: source,
  };
}
