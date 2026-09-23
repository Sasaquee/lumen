import type { Invoice, Item, Ledger } from './engine';
import { NOTIF_ENABLED, NOTIF_HOUR, NOTIF_OFFSETS } from './types';
import { addMonths, daysBetween, formatDate, fromISODate, monthOf, today, toISODate } from '../utils/dates';
import { formatMoney } from '../utils/money';

/** Quantos dias antes do vencimento avisar. */
export const OFFSETS = [7, 3, 1] as const;
export const DEFAULT_OFFSETS = '7,3,1';
export const DEFAULT_HOUR = 9;

/** Android limita alarmes pendentes; ficam os avisos mais próximos. */
export const MAX_SCHEDULED = 60;
/** Até onde olhar para a frente ao montar avisos. */
const MONTHS_AHEAD = 4;
/** Quanto tempo para trás a central mostra contas vencidas. */
const OVERDUE_DAYS = 120;

export const offsetLabel = (d: number) =>
  d === 1 ? 'Vence amanhã' : d === 7 ? 'Vence em 1 semana' : `Vence em ${d} dias`;

export interface NotifSettings {
  enabled: boolean;
  hour: number;
  offsets: number[];
}

export function notifSettings(ledger: Ledger): NotifSettings {
  const get = (k: string) => ledger.snap.settings.find((s) => s.key === k)?.value;
  const raw = get(NOTIF_OFFSETS) ?? DEFAULT_OFFSETS;
  const offsets = raw
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => (OFFSETS as readonly number[]).includes(n));
  const hour = Number(get(NOTIF_HOUR));
  return {
    enabled: get(NOTIF_ENABLED) === '1',
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.round(hour))) : DEFAULT_HOUR,
    offsets: offsets.length ? [...new Set(offsets)].sort((a, b) => b - a) : [...OFFSETS],
  };
}

/** Uma conta em aberto: despesa fora do cartão ou fatura inteira. */
export interface Due {
  key: string;
  date: string;
  description: string;
  amount: number;
  item?: Item;
  invoice?: Invoice;
}

const shiftDays = (date: string, n: number) => {
  const d = fromISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

/** Contas ainda não pagas com vencimento entre `from` e `to`, em ordem de vencimento. */
export function openDues(ledger: Ledger, from: string, to: string): Due[] {
  const out: Due[] = [];
  const seen = new Set<string>();
  const last = monthOf(to) > ledger.cycleOf(to) ? monthOf(to) : ledger.cycleOf(to);
  let cycle = ledger.cycleOf(from);
  for (let guard = 0; guard < 60 && cycle <= last; guard++, cycle = addMonths(cycle, 1)) {
    const data = ledger.month(cycle);
    for (const it of data.expenses) {
      // vale refeição sai do saldo na hora da compra: não há nada a vencer nem a lembrar
      if (it.method === 'vr') continue;
      if (it.paid || it.dueDate < from || it.dueDate > to || seen.has(it.key)) continue;
      seen.add(it.key);
      out.push({ key: it.key, date: it.dueDate, description: it.description, amount: it.amount, item: it });
    }
    for (const inv of data.invoices) {
      if (inv.paid || inv.total <= 0 || inv.dueDate < from || inv.dueDate > to || seen.has(inv.key)) continue;
      seen.add(inv.key);
      out.push({
        key: inv.key,
        date: inv.dueDate,
        description: `Fatura ${inv.card.name}`,
        amount: inv.total,
        invoice: inv,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, 'pt-BR'));
}

export interface Reminder {
  when: Date;
  title: string;
  body: string;
  /** Contas cobertas por este aviso. */
  dues: Due[];
}

/**
 * Um aviso por DIA, não por vencimento: no fim do ciclo várias contas caem juntas e
 * isso viraria uma enxurrada de notificações. O detalhe fica na central, dentro do app.
 */
export function buildReminders(ledger: Ledger, now = new Date()): Reminder[] {
  const { hour, offsets } = notifSettings(ledger);
  const from = toISODate(now);
  const dues = openDues(ledger, from, shiftDays(from, MONTHS_AHEAD * 31));

  // dia em que o aviso dispara -> o que ele cobre
  const byFireDay = new Map<string, { due: Due; offset: number }[]>();
  for (const due of dues) {
    for (const off of offsets) {
      const fire = shiftDays(due.date, -off);
      if (fire < from) continue;
      const list = byFireDay.get(fire) ?? [];
      list.push({ due, offset: off });
      byFireDay.set(fire, list);
    }
  }

  const out: Reminder[] = [];
  for (const [fire, entries] of byFireDay) {
    const when = fromISODate(fire);
    when.setHours(hour, 0, 0, 0);
    if (when.getTime() <= now.getTime()) continue;

    const total = entries.reduce((s, e) => s + e.due.amount, 0);
    const dates = [...new Set(entries.map((e) => e.due.date))].sort();
    const oneDate = dates.length === 1;

    let title: string;
    let body: string;
    if (entries.length === 1) {
      title = offsetLabel(entries[0].offset);
      body = `${entries[0].due.description} · ${formatMoney(total)} · ${formatDate(dates[0])}`;
    } else {
      title = `${entries.length} contas a vencer`;
      body = oneDate
        ? `${formatMoney(total)} · ${offsetLabel(entries[0].offset).toLowerCase()} (${formatDate(dates[0])})`
        : `${formatMoney(total)} · entre ${formatDate(dates[0])} e ${formatDate(dates[dates.length - 1])}`;
    }

    out.push({ when, title, body, dues: entries.map((e) => e.due) });
  }

  return out.sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, MAX_SCHEDULED);
}

export type AlertTone = 'danger' | 'warning' | 'normal';

export interface AlertGroup {
  key: string;
  label: string;
  tone: AlertTone;
  dues: Due[];
  total: number;
}

/**
 * O que a central mostra: tudo em aberto, das vencidas às que ainda vão vencer,
 * separado por urgência.
 */
export function notificationCenter(ledger: Ledger, now = today()): AlertGroup[] {
  const dues = openDues(ledger, shiftDays(now, -OVERDUE_DAYS), shiftDays(now, 60));
  const buckets: { key: string; label: string; tone: AlertTone; test: (d: Due) => boolean }[] = [
    { key: 'overdue', label: 'Vencidas', tone: 'danger', test: (d) => d.date < now },
    { key: 'today', label: 'Vence hoje', tone: 'danger', test: (d) => d.date === now },
    { key: 'week', label: 'Próximos 7 dias', tone: 'warning', test: (d) => daysBetween(now, d.date) <= 7 },
    { key: 'later', label: 'Mais adiante', tone: 'normal', test: () => true },
  ];

  const groups: AlertGroup[] = buckets.map((b) => ({ key: b.key, label: b.label, tone: b.tone, dues: [], total: 0 }));
  for (const d of dues) {
    const idx = buckets.findIndex((b) => b.test(d));
    groups[idx].dues.push(d);
    groups[idx].total += d.amount;
  }
  return groups.filter((g) => g.dues.length > 0);
}

/** Quantas contas pedem atenção agora: vencidas ou vencendo em até 3 dias. */
export function alertCount(ledger: Ledger, now = today()): number {
  return openDues(ledger, shiftDays(now, -OVERDUE_DAYS), shiftDays(now, 3)).length;
}
