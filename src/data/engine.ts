import type { Snapshot } from './db';
import type { Card, Category, Entry, InvoiceTotal, Kind, Method, Recurring, Wallet } from './types';
import { CYCLE_START_DAY, VR } from './types';
import {
  addMonths, CALENDAR_CYCLE_DAY, cycleEnd as cycleEndDate, cycleOf as cycleOfDate, cycleRange as cycleRangeLabel,
  cycleStart as cycleStartDate, dateInCycle as dateInCycleOf, dateInMonth, dayOf, daysBetween, fromISODate,
  monthDiff, monthOf, normalizeCycleDay, toISODate, today,
} from '../utils/dates';
import { installmentAmount } from '../utils/money';

export type Source = 'entry' | 'installment' | 'recurring' | 'undetailed' | 'invoice';

/** Uma ocorrência concreta de um lançamento dentro de um mês. */
export interface Item {
  key: string; // chave de pagamento individual
  source: Source;
  kind: Kind;
  description: string;
  amount: number;
  date: string; // data de referência dentro do mês (compra/cobrança)
  categoryId: number | null;
  method: Method;
  cardId: number | null;
  /** Vale que pagou ou creditou, quando o método é `vr`. */
  walletId?: number | null;
  paid: boolean;
  installment?: { index: number; total: number };
  entryId?: number;
  recurringId?: number;
  overridden?: boolean;
  /**
   * Data em que o dinheiro sai: no cartão é o vencimento da fatura, fora dele é a
   * própria data do item. É por ela que os períodos por dia são somados.
   */
  dueDate: string;
  /** Mês de vencimento da fatura em que o item entrou (só para itens de cartão). */
  invoiceMonth?: string;
  /**
   * Mês usado como chave de ajuste/pular mês de um recorrente. Fora do cartão é o
   * próprio ciclo; no cartão é o mês civil da cobrança.
   */
  chargeMonth?: string;
}

export interface Invoice {
  card: Card;
  /** Mês de vencimento — identifica a fatura. */
  month: string;
  /** Ciclo financeiro em que esta fatura é paga. */
  cycle: string;
  key: string;
  dueDate: string;
  closingDate: string;
  /** Lançamentos detalhados que caem nesta fatura. */
  items: Item[];
  /** Soma só dos lançamentos detalhados. */
  itemsTotal: number;
  /** Total informado manualmente; null quando a fatura é apenas a soma dos lançamentos. */
  declaredTotal: number | null;
  /** Parte do total informado que não foi detalhada (gastos que a pessoa não lembra). */
  undetailed: number;
  /** Os detalhes somam mais que o total informado (provável erro de digitação). */
  overDetailed: boolean;
  /** Observação do total informado. */
  notes: string | null;
  /** Fixo mensal que o banco ainda não lançou — existe na projeção, não na fatura real. */
  pending: number;
  /** O que o banco já cobrou: é este o número que aparece no app do banco. */
  charged: number;
  /** Total considerado nos cálculos do mês: o cobrado mais a projeção do fixo mensal. */
  total: number;
  paid: boolean;
}

/** Categoria sintética para a parte não detalhada das faturas. */
export const UNDETAILED_CATEGORY: Category = {
  id: -1, name: 'Cartão não detalhado', icon: 'help-circle-outline', color: '#5B6673', kind: 'expense', archived: 0,
};

/** Categoria sintética que junta tudo que passa no cartão de crédito. */
export const CARD_CATEGORY: Category = {
  id: -2, name: 'Cartão de crédito', icon: 'credit-card-outline', color: '#9085E9', kind: 'expense', archived: 0,
};

/**
 * Como o cartão entra no gráfico de categorias.
 * `grouped`: tudo do cartão vira um grupo só.
 * `open`: o que está detalhado vai para a categoria do lançamento e só o
 * não detalhado continua em Cartão de crédito.
 */
export type CardMode = 'grouped' | 'open';

/** Quanto um vale tinha para gastar num ciclo e o que restou dele. */
export interface WalletSummary {
  wallet: Wallet;
  /** Saldo que veio do ciclo anterior. */
  previous: number;
  /** Crédito que já caiu neste ciclo. */
  credited: number;
  /** Crédito deste ciclo cuja data ainda não chegou — não dá para gastar ainda. */
  pending: number;
  /** Quando o próximo crédito cai, se ainda houver algum por vir. */
  pendingDate: string | null;
  /** Gasto pago com este vale no ciclo. */
  spent: number;
  /** Tudo que dava para gastar: o que sobrou antes mais o crédito de agora. */
  total: number;
  /** O que restou depois dos gastos. */
  left: number;
}

export interface MonthData {
  month: string;
  incomes: Item[];
  expenses: Item[]; // fora do cartão
  invoices: Invoice[];
  totals: {
    income: number;
    incomeReceived: number;
    expense: number;
    expensePaid: number;
    balance: number; // sobra prevista
    fixed: number;
    installments: number;
    oneOff: number;
    card: number;
    /** Somatório das partes não detalhadas das faturas do mês. */
    undetailed: number;
    /** Crédito de vale refeição que entrou no período. */
    vrIn: number;
    /** Quanto foi gasto pagando com o vale refeição. */
    vrOut: number;
  };
}

/**
 * Fixo mensal cuja data de cobrança ainda não chegou. O banco só lança a assinatura no
 * dia, então ela existe na projeção do Lumen e não na fatura do app do banco. Compra
 * parcelada não entra aqui: o banco já sabe das parcelas futuras desde a compra.
 */
export function isPendingCharge(it: Item, now = today()): boolean {
  return it.source === 'recurring' && it.date > now;
}

/** Mês de vencimento da fatura em que uma compra feita em `date` cai. */
export function invoiceMonthFor(card: Card, date: string): string {
  let closeMonth = monthOf(date);
  if (dayOf(date) >= card.closing_day) closeMonth = addMonths(closeMonth, 1);
  return card.due_day > card.closing_day ? closeMonth : addMonths(closeMonth, 1);
}

export function invoiceDates(card: Card, dueMonth: string) {
  const closeMonth = card.due_day > card.closing_day ? dueMonth : addMonths(dueMonth, -1);
  return { dueDate: dateInMonth(dueMonth, card.due_day), closingDate: dateInMonth(closeMonth, card.closing_day) };
}

/** Uma data de compra que cai na fatura que vence em `dueMonth` (hoje quando couber). */
export function dateInInvoice(card: Card, dueMonth: string): string {
  const now = today();
  if (invoiceMonthFor(card, now) === dueMonth) return now;
  const { closingDate } = invoiceDates(card, dueMonth);
  const d = fromISODate(closingDate);
  d.setDate(d.getDate() - 1); // o próprio dia de fechamento já cai na fatura seguinte
  return toISODate(d);
}

export class Ledger {
  private paid: Set<string>;
  private overrides: Map<string, { amount: number | null; skipped: boolean }>;
  private cardsById: Map<number, Card>;
  private declaredByKey: Map<string, InvoiceTotal>;
  readonly categoriesById: Map<number, Category>;
  /** Dia em que o mês financeiro começa. 1 = mês civil. */
  readonly cycleStartDay: number;

  constructor(readonly snap: Snapshot) {
    this.paid = new Set(snap.paid.map((p) => p.key));
    this.overrides = new Map(snap.overrides.map((o) => [`${o.recurring_id}:${o.month}`, { amount: o.amount_cents, skipped: !!o.skipped }]));
    this.cardsById = new Map(snap.cards.map((c) => [c.id, c]));
    this.categoriesById = new Map(snap.categories.map((c) => [c.id, c]));
    this.declaredByKey = new Map(snap.invoiceTotals.map((t) => [`${t.card_id}:${t.month}`, t]));
    this.cycleStartDay = normalizeCycleDay(Number(snap.settings.find((s) => s.key === CYCLE_START_DAY)?.value ?? CALENDAR_CYCLE_DAY));
  }

  // ---------- Ciclo financeiro ----------
  /** true quando o usuário configurou um ciclo diferente do mês civil. */
  get customCycle() {
    return this.cycleStartDay !== CALENDAR_CYCLE_DAY;
  }

  /** Ciclo em que uma data cai. */
  cycleOf(date: string) {
    return cycleOfDate(date, this.cycleStartDay);
  }

  cycleStart(cycle: string) {
    return cycleStartDate(cycle, this.cycleStartDay);
  }

  cycleEnd(cycle: string) {
    return cycleEndDate(cycle, this.cycleStartDay);
  }

  /** Data dentro do ciclo com o dia pedido (ex.: vencimento de uma conta fixa). */
  dateInCycle(cycle: string, day: number) {
    return dateInCycleOf(cycle, day, this.cycleStartDay);
  }

  /** Período do ciclo em texto: "06/09 → 05/10". */
  cycleRange(cycle: string) {
    return cycleRangeLabel(cycle, this.cycleStartDay);
  }

  currentCycle() {
    return this.cycleOf(today());
  }

  /** Dias que ainda faltam para o ciclo terminar (inclusive hoje). */
  daysLeftIn(cycle: string) {
    return Math.max(0, daysBetween(today(), this.cycleEnd(cycle)) + 1);
  }

  card(id: number | null) {
    return id == null ? undefined : this.cardsById.get(id);
  }

  category(id: number | null) {
    if (id == null) return undefined;
    if (id === UNDETAILED_CATEGORY.id) return UNDETAILED_CATEGORY;
    if (id === CARD_CATEGORY.id) return CARD_CATEGORY;
    return this.categoriesById.get(id);
  }

  isPaid(key: string) {
    return this.paid.has(key);
  }

  override(recurringId: number, month: string) {
    return this.overrides.get(`${recurringId}:${month}`);
  }

  // ---------- Faturas ----------
  /** Ciclo em que a fatura que vence em `invoiceMonth` é paga. */
  invoiceCycle(card: Card, invoiceMonth: string) {
    return this.cycleOf(invoiceDates(card, invoiceMonth).dueDate);
  }

  /** Faturas (identificadas pelo mês de vencimento) que vencem dentro do ciclo. */
  invoiceMonthsIn(card: Card, cycle: string): string[] {
    const out: string[] = [];
    for (let d = -1; d <= 1; d++) {
      const m = addMonths(cycle, d);
      if (this.invoiceCycle(card, m) === cycle) out.push(m);
    }
    return out;
  }

  /**
   * A fatura que o ciclo paga. O app inteiro nomeia os meses pelo ciclo, então a tela
   * de fatura precisa fazer o caminho de volta: "Setembro" é a fatura que vence dentro
   * do ciclo de setembro, mesmo que no banco ela seja a fatura de outubro.
   */
  invoiceMonthOfCycle(card: Card, cycle: string): string {
    const due = this.invoiceMonthsIn(card, cycle);
    if (due.length) return due[0];
    // vencimento clampado (dia 31) pode deixar um ciclo sem fatura nenhuma: mantém o passo
    return addMonths(cycle, monthDiff(this.invoiceCycle(card, cycle), cycle));
  }

  /** Fatura do cartão que ainda não venceu (a "atual"). */
  openInvoiceMonth(card: Card, from = today()): string {
    const m = monthOf(from);
    return invoiceDates(card, m).dueDate < from ? addMonths(m, 1) : m;
  }

  /** Em que fatura a compra cai: a fixada, se houver, senão a que a data determina. */
  entryInvoiceMonth(card: Card, e: Entry): string {
    return e.invoice_month ?? invoiceMonthFor(card, e.date);
  }

  /** Mês de competência (ciclo em que o dinheiro sai) da parcela `k` de um lançamento. */
  entryMonth(e: Entry, k: number): string {
    const card = e.kind === 'expense' && e.method === 'cartao' ? this.card(e.card_id) : undefined;
    if (card) return this.invoiceCycle(card, addMonths(this.entryInvoiceMonth(card, e), k));
    return addMonths(this.cycleOf(e.date), k);
  }

  private recurringActive(r: Recurring, chargeMonth: string) {
    if (chargeMonth < r.start_month) return false;
    if (r.end_month && chargeMonth > r.end_month) return false;
    return true;
  }

  /** Lançamentos detalhados de uma fatura (por mês de vencimento). */
  private invoiceItems(card: Card, invoiceMonth: string): Item[] {
    const out: Item[] = [];
    const { dueDate } = invoiceDates(card, invoiceMonth);
    for (const e of this.snap.entries) {
      if (e.kind !== 'expense' || e.method !== 'cartao' || e.card_id !== card.id) continue;
      const n = Math.max(1, e.installments);
      const k = monthDiff(this.entryInvoiceMonth(card, e), invoiceMonth);
      if (k < 0 || k >= n) continue;
      const key = `e:${e.id}:${k}`;
      out.push({
        key,
        source: n > 1 ? 'installment' : 'entry',
        kind: e.kind,
        description: e.description,
        amount: installmentAmount(e.amount_cents, n, k),
        date: e.date,
        categoryId: e.category_id,
        method: e.method,
        cardId: card.id,
        paid: this.paid.has(key),
        installment: n > 1 ? { index: k + 1, total: n } : undefined,
        entryId: e.id,
        dueDate,
        invoiceMonth,
      });
    }
    for (const r of this.snap.recurrings) {
      if (r.kind !== 'expense' || r.method !== 'cartao' || r.card_id !== card.id) continue;
      // mês da cobrança: procura a cobrança cuja fatura é justamente esta
      let chargeMonth: string | undefined;
      for (let d = 0; d >= -2; d--) {
        const m = addMonths(invoiceMonth, d);
        if (invoiceMonthFor(card, dateInMonth(m, r.day)) === invoiceMonth) { chargeMonth = m; break; }
      }
      if (!chargeMonth || !this.recurringActive(r, chargeMonth)) continue;
      const ov = this.override(r.id, chargeMonth);
      if (ov?.skipped) continue;
      const key = `r:${r.id}:${chargeMonth}`;
      out.push({
        key,
        source: 'recurring',
        kind: r.kind,
        description: r.description,
        amount: ov?.amount ?? r.amount_cents,
        date: dateInMonth(chargeMonth, r.day),
        categoryId: r.category_id,
        method: r.method,
        cardId: card.id,
        paid: this.paid.has(key),
        recurringId: r.id,
        overridden: ov?.amount != null,
        dueDate,
        invoiceMonth,
        chargeMonth,
      });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  private invoiceCache = new Map<string, Invoice>();

  private buildInvoice(card: Card, invoiceMonth: string): Invoice {
    const id = `${card.id}:${invoiceMonth}`;
    const cached = this.invoiceCache.get(id);
    if (cached) return cached;

    const items = this.invoiceItems(card, invoiceMonth);
    const itemsTotal = items.reduce((s, i) => s + i.amount, 0);
    const pending = items.reduce((s, i) => s + (isPendingCharge(i) ? i.amount : 0), 0);
    // o total informado vem do app do banco, então cobre só o que já foi cobrado
    const itemsCharged = itemsTotal - pending;
    const dec = this.declaredByKey.get(id);
    const declaredTotal = dec ? dec.amount_cents : null;
    const key = `c:${card.id}:${invoiceMonth}`;
    const paid = this.paid.has(key);
    const inv: Invoice = {
      card,
      month: invoiceMonth,
      cycle: this.invoiceCycle(card, invoiceMonth),
      key,
      paid,
      items: items.map((i) => ({ ...i, paid })),
      itemsTotal,
      declaredTotal,
      undetailed: declaredTotal == null ? 0 : Math.max(0, declaredTotal - itemsCharged),
      overDetailed: declaredTotal != null && itemsCharged > declaredTotal,
      notes: dec?.notes ?? null,
      pending,
      // nunca subestima o mês: se os detalhes passarem do total informado, vale a soma dos detalhes
      charged: declaredTotal == null ? itemsCharged : Math.max(declaredTotal, itemsCharged),
      total:
        (declaredTotal == null ? itemsCharged : Math.max(declaredTotal, itemsCharged)) + pending,
      ...invoiceDates(card, invoiceMonth),
    };
    this.invoiceCache.set(id, inv);
    return inv;
  }

  /** Fatura de um cartão pelo mês de vencimento (existe mesmo vazia). */
  invoice(cardId: number, invoiceMonth: string): Invoice | undefined {
    const card = this.cardsById.get(cardId);
    return card ? this.buildInvoice(card, invoiceMonth) : undefined;
  }

  /** Lançamentos do ciclo que não estão em fatura de cartão. */
  private plainItems(cycle: string): Item[] {
    const out: Item[] = [];
    for (const e of this.snap.entries) {
      if (e.kind === 'expense' && e.method === 'cartao' && this.card(e.card_id)) continue;
      const n = Math.max(1, e.installments);
      const k = monthDiff(this.cycleOf(e.date), cycle);
      if (k < 0 || k >= n) continue;
      const key = `e:${e.id}:${k}`;
      const itemDate = n > 1 ? this.dateInCycle(cycle, dayOf(e.date)) : e.date;
      out.push({
        key,
        source: n > 1 ? 'installment' : 'entry',
        kind: e.kind,
        description: e.description,
        amount: installmentAmount(e.amount_cents, n, k),
        date: itemDate,
        dueDate: itemDate,
        categoryId: e.category_id,
        method: e.method,
        cardId: null,
        walletId: e.wallet_id,
        // vale sai do saldo na compra: não existe estado "a pagar"
        paid: e.method === VR || this.paid.has(key),
        installment: n > 1 ? { index: k + 1, total: n } : undefined,
        entryId: e.id,
      });
    }
    for (const r of this.snap.recurrings) {
      if (r.kind === 'expense' && r.method === 'cartao' && this.card(r.card_id)) continue;
      if (!this.recurringActive(r, cycle)) continue;
      const ov = this.override(r.id, cycle);
      if (ov?.skipped) continue;
      const key = `r:${r.id}:${cycle}`;
      const recDate = this.dateInCycle(cycle, r.day);
      out.push({
        key,
        source: 'recurring',
        kind: r.kind,
        description: r.description,
        amount: ov?.amount ?? r.amount_cents,
        date: recDate,
        dueDate: recDate,
        categoryId: r.category_id,
        method: r.method,
        cardId: null,
        walletId: r.wallet_id,
        paid: r.method === VR || this.paid.has(key),
        recurringId: r.id,
        overridden: ov?.amount != null,
        chargeMonth: cycle,
      });
    }
    return out;
  }

  private cache = new Map<string, MonthData>();
  private vrCache = new Map<string, number>();

  // ---------- Vales (benefícios) ----------
  /** Vales ativos, na ordem em que aparecem nas telas. */
  get wallets(): Wallet[] {
    return this.snap.wallets.filter((w) => !w.archived);
  }

  wallet(id: number | null | undefined) {
    return id == null ? undefined : this.snap.wallets.find((w) => w.id === id);
  }

  /** true quando existe algum vale cadastrado. */
  get usesVr() {
    return this.snap.wallets.length > 0;
  }

  /**
   * O que entrou e o que saiu de um vale no ciclo.
   *
   * No ciclo corrente só vale o que já aconteceu: crédito com data à frente ainda não
   * está no cartão, e mostrar esse dinheiro como disponível é mentira. Em ciclo futuro
   * tudo conta, porque aí a tela inteira é previsão.
   */
  walletFlow(walletId: number, cycle: string) {
    const d = this.month(cycle);
    const now = today();
    const ahead = cycle > this.currentCycle();
    let credited = 0;
    let pending = 0;
    let pendingDate: string | null = null;
    let spent = 0;
    for (const i of d.incomes) {
      if (i.method !== VR || i.walletId !== walletId) continue;
      if (!ahead && i.date > now) {
        pending += i.amount;
        if (!pendingDate || i.date < pendingDate) pendingDate = i.date;
        continue;
      }
      credited += i.amount;
    }
    for (const i of d.expenses) {
      if (i.method !== VR || i.walletId !== walletId) continue;
      if (!ahead && i.date > now) continue; // compra marcada para depois ainda não saiu
      spent += i.amount;
    }
    return { credited, pending, pendingDate, spent };
  }

  /** Saldo de um vale no fim do ciclo, acumulado desde o primeiro lançamento. */
  walletBalance(walletId: number, cycle: string): number {
    const key = `${walletId}:${cycle}`;
    const cached = this.vrCache.get(key);
    if (cached != null) return cached;
    let total = 0;
    let m = this.firstCycleWithData();
    for (let guard = 0; m <= cycle && guard < 600; guard++, m = addMonths(m, 1)) {
      const f = this.walletFlow(walletId, m);
      total += f.credited - f.spent;
    }
    this.vrCache.set(key, total);
    return total;
  }

  /**
   * O que o vale tinha para gastar no ciclo e o que restou. O "limite" de um vale não
   * é fixo: é o que sobrou do mês anterior mais o crédito que entrou agora.
   */
  walletSummary(walletId: number, cycle: string): WalletSummary | undefined {
    const wallet = this.wallet(walletId);
    if (!wallet) return undefined;
    const { credited, pending, pendingDate, spent } = this.walletFlow(walletId, cycle);
    const previous = this.walletBalance(walletId, addMonths(cycle, -1));
    const total = previous + credited;
    return { wallet, previous, credited, pending, pendingDate, spent, total, left: total - spent };
  }

  /** Resumo de todos os vales ativos no ciclo. */
  walletSummaries(cycle: string): WalletSummary[] {
    return this.wallets
      .map((w) => this.walletSummary(w.id, cycle))
      .filter((x): x is WalletSummary => !!x);
  }

  /** Primeiro ciclo com algum lançamento: onde o saldo acumulado começa a contar. */
  private firstCycleWithData(): string {
    let first: string | undefined;
    const take = (m: string) => { if (!first || m < first) first = m; };
    for (const e of this.snap.entries) take(this.cycleOf(e.date));
    for (const r of this.snap.recurrings) take(r.start_month);
    return first ?? this.currentCycle();
  }

  /**
   * Saldo do vale refeição no fim do ciclo. O que não foi usado fica para o mês
   * seguinte, como no cartão de verdade, então o saldo é acumulado desde o começo.
   */
  vrBalance(cycle: string): number {
    const cached = this.vrCache.get('all:' + cycle);
    if (cached != null) return cached;
    let total = 0;
    let m = this.firstCycleWithData();
    for (let guard = 0; m <= cycle && guard < 600; guard++, m = addMonths(m, 1)) {
      const t = this.month(m).totals;
      total += t.vrIn - t.vrOut;
    }
    this.vrCache.set('all:' + cycle, total);
    return total;
  }

  /** Quanto sobrou do crédito que entrou neste ciclo (sem contar o acumulado). */
  vrLeftOfCycle(cycle: string): number {
    const t = this.month(cycle).totals;
    return t.vrIn - t.vrOut;
  }


  month(month: string): MonthData {
    const cached = this.cache.get(month);
    if (cached) return cached;

    const invoices: Invoice[] = [];
    for (const card of this.snap.cards) {
      for (const invoiceMonth of this.invoiceMonthsIn(card, month)) {
        const inv = this.buildInvoice(card, invoiceMonth);
        if (inv.items.length > 0 || inv.declaredTotal != null) invoices.push(inv);
      }
    }
    invoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const incomes: Item[] = [];
    const expenses: Item[] = [];
    for (const it of this.plainItems(month)) (it.kind === 'income' ? incomes : expenses).push(it);
    const byDate = (a: Item, b: Item) => a.date.localeCompare(b.date);
    incomes.sort(byDate);
    expenses.sort(byDate);

    const sum = (items: Item[]) => items.reduce((s, i) => s + i.amount, 0);
    const cardTotal = invoices.reduce((s, i) => s + i.total, 0);
    const undetailed = invoices.reduce((s, i) => s + i.undetailed, 0);
    // o vale refeição é uma carteira separada: entra e sai dele, não do caixa
    const isVr = (i: Item) => i.method === VR;
    const vrIn = sum(incomes.filter(isVr));
    const vrOut = sum(expenses.filter(isVr));
    const cashIncomes = incomes.filter((i) => !isVr(i));
    const cashExpenses = expenses.filter((i) => !isVr(i));
    const allExpenses = [...cashExpenses, ...invoices.flatMap((i) => i.items)];
    const income = sum(cashIncomes);
    const expense = sum(cashExpenses) + cardTotal;

    const data: MonthData = {
      month,
      incomes,
      expenses,
      invoices,
      totals: {
        income,
        incomeReceived: sum(cashIncomes.filter((i) => i.paid)),
        expense,
        expensePaid: sum(cashExpenses.filter((i) => i.paid)) + invoices.filter((i) => i.paid).reduce((s, i) => s + i.total, 0),
        balance: income - expense,
        fixed: sum(allExpenses.filter((i) => i.source === 'recurring')),
        installments: sum(allExpenses.filter((i) => i.source === 'installment')),
        oneOff: sum(allExpenses.filter((i) => i.source === 'entry')) + undetailed,
        card: cardTotal,
        undetailed,
        vrIn,
        vrOut,
      },
    };
    this.cache.set(month, data);
    return data;
  }

  /**
   * Item sintético para a parte não detalhada de uma fatura, para que ela apareça
   * em listas, filtros e gráficos como qualquer outra despesa.
   */
  undetailedItem(inv: Invoice): Item {
    return {
      key: `${inv.key}:undetailed`,
      source: 'undetailed',
      kind: 'expense',
      description: `Outros gastos · ${inv.card.name}`,
      amount: inv.undetailed,
      date: inv.dueDate,
      dueDate: inv.dueDate,
      categoryId: UNDETAILED_CATEGORY.id,
      method: 'cartao',
      cardId: inv.card.id,
      paid: inv.paid,
      invoiceMonth: inv.month,
    };
  }

  /**
   * A fatura inteira como um item, para a lista de lançamentos: o detalhe do cartão
   * fica só na tela da fatura.
   */
  invoiceItem(inv: Invoice): Item {
    return {
      key: inv.key,
      source: 'invoice',
      kind: 'expense',
      description: `Fatura ${inv.card.name}`,
      amount: inv.total,
      date: inv.dueDate,
      dueDate: inv.dueDate,
      categoryId: CARD_CATEGORY.id,
      method: 'cartao',
      cardId: inv.card.id,
      paid: inv.paid,
      invoiceMonth: inv.month,
    };
  }

  /** O que a aba Mês lista: despesas fora do cartão e uma linha por fatura. */
  listItems(month: string): Item[] {
    const m = this.month(month);
    return [...m.expenses, ...m.invoices.filter((i) => i.total > 0).map((i) => this.invoiceItem(i))];
  }

  /**
   * Todas as despesas do mês: avulsas, itens de fatura e a parte não detalhada.
   *
   * Gasto de vale fica de fora por padrão, para o gráfico fechar com o total de
   * despesas do mês — ele não saiu do caixa. Com `withWallets`, entra também, e aí
   * o gráfico mostra o consumo inteiro em vez de só o dinheiro.
   */
  expenseItems(month: string, withWallets = false): Item[] {
    const m = this.month(month);
    const plain = withWallets ? m.expenses : m.expenses.filter((i) => i.method !== VR);
    const out = [...plain, ...m.invoices.flatMap((i) => i.items)];
    for (const inv of m.invoices) if (inv.undetailed > 0) out.push(this.undetailedItem(inv));
    return out;
  }

  /** Em que fatia do gráfico um item cai, conforme o cartão esteja agrupado ou aberto. */
  private sliceOf(item: Item, mode: CardMode): number | null {
    if (item.cardId == null) return item.categoryId;
    // agrupado: tudo do cartão vira um grupo; aberto: só o que não foi detalhado fica nele
    if (mode === 'grouped' || item.source === 'undetailed') return CARD_CATEGORY.id;
    return item.categoryId;
  }

  private groupByCategory(items: Item[], mode: CardMode) {
    const totals = new Map<number | null, number>();
    for (const it of items) {
      const id = this.sliceOf(it, mode);
      totals.set(id, (totals.get(id) ?? 0) + it.amount);
    }
    return [...totals.entries()]
      .map(([id, value]) => ({ category: this.category(id), id, value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  byCategory(month: string, mode: CardMode = 'grouped', withWallets = false) {
    return this.groupByCategory(this.expenseItems(month, withWallets), mode);
  }

  /**
   * Gastos por categoria num intervalo de datas (inclusive), no nível do dia.
   * Soma pela data em que o dinheiro sai, então cada parcela conta uma vez só.
   */
  byCategoryRange(from: string, to: string, mode: CardMode = 'grouped', withWallets = false) {
    return this.groupByCategory(this.itemsBetween(from, to, withWallets), mode);
  }

  /** Despesas cuja saída de dinheiro cai entre `from` e `to` (inclusive). */
  itemsBetween(from: string, to: string, withWallets = false): Item[] {
    if (from > to) return this.itemsBetween(to, from, withWallets);
    const out: Item[] = [];
    const last = this.cycleOf(to);
    let c = this.cycleOf(from);
    for (let guard = 0; guard < 600 && c <= last; guard++, c = addMonths(c, 1)) {
      for (const it of this.expenseItems(c, withWallets)) {
        if (it.dueDate >= from && it.dueDate <= to) out.push(it);
      }
    }
    return out;
  }

  /** Total informado para a fatura de um cartão em um mês, se houver. */
  declaredTotal(cardId: number, invoiceMonth: string) {
    return this.declaredByKey.get(`${cardId}:${invoiceMonth}`);
  }

  /** Parcelamentos com parcelas restantes a partir de `month`. */
  activeInstallments(month: string) {
    return this.snap.entries
      .filter((e) => e.installments > 1)
      .map((e) => {
        const first = this.entryMonth(e, 0);
        const last = addMonths(first, e.installments - 1);
        const current = Math.min(Math.max(monthDiff(first, month) + 1, 0), e.installments);
        const remainingCount = e.installments - Math.max(current - 1, 0);
        let remaining = 0;
        for (let k = Math.max(current - 1, 0); k < e.installments; k++) remaining += installmentAmount(e.amount_cents, e.installments, k);
        return { entry: e, first, last, current, remainingCount, remaining, finished: last < month };
      })
      .sort((a, b) => Number(a.finished) - Number(b.finished) || a.last.localeCompare(b.last));
  }

  /** Limite comprometido: faturas ainda não pagas a partir do mês de vencimento informado. */
  /** Até que fatura vale a pena olhar: a última parcela, o último total informado ou 2 à frente. */
  private lastInvoiceMonth(card: Card, from: string): string {
    let last = addMonths(from, 2);
    for (const e of this.snap.entries) {
      if (e.kind !== 'expense' || e.method !== 'cartao' || e.card_id !== card.id) continue;
      const m = addMonths(this.entryInvoiceMonth(card, e), Math.max(1, e.installments) - 1);
      if (m > last) last = m;
    }
    for (const t of this.snap.invoiceTotals) {
      if (t.card_id === card.id && t.month > last) last = t.month;
    }
    return last;
  }

  /**
   * Limite ocupado: soma das faturas em aberto a partir de `fromInvoiceMonth`.
   * Fixo mensal que ainda não foi cobrado fica de fora — ele só ocupa limite no dia da cobrança.
   */
  cardCommitted(cardId: number, fromInvoiceMonth: string) {
    const card = this.cardsById.get(cardId);
    if (!card) return 0;
    const now = today();
    const nowCycle = this.currentCycle();
    let total = 0;
    const last = this.lastInvoiceMonth(card, fromInvoiceMonth);
    let m = fromInvoiceMonth;
    for (let guard = 0; guard < 240 && m <= last; guard++, m = addMonths(m, 1)) {
      const inv = this.buildInvoice(card, m);
      if (inv.paid) continue;
      for (const it of inv.items) {
        // O fixo mensal ocupa limite assim que o mês dele chega — e "o mês dele" é o mês
        // em que a fatura é paga, que é como o app mostra o lançamento. O dos próximos
        // meses fica de fora, a não ser que a cobrança já tenha acontecido de fato.
        if (isPendingCharge(it, now) && inv.cycle > nowCycle) continue;
        total += it.amount;
      }
      total += inv.undetailed;
    }
    return total;
  }

  /** Quanto ainda dá para gastar; null quando o cartão não tem limite cadastrado. */
  cardAvailable(cardId: number, fromInvoiceMonth: string) {
    const card = this.cardsById.get(cardId);
    if (!card?.limit_cents) return null;
    return card.limit_cents - this.cardCommitted(cardId, fromInvoiceMonth);
  }
}
