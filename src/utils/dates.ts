/** Mês no formato "YYYY-MM". Datas no formato "YYYY-MM-DD". */

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toISODate(new Date());
}

export function currentMonth(): string {
  return today().slice(0, 7);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Diferença em meses: b - a. */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Data dentro do mês, limitando o dia ao último dia do mês. */
export function dateInMonth(month: string, day: number): string {
  return `${month}-${pad(Math.min(Math.max(day, 1), daysInMonth(month)))}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(month: string, withYear = false): string {
  const [y, m] = month.split('-').map(Number);
  return withYear ? `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}` : MONTHS_SHORT[m - 1];
}

export function formatDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function formatDateLong(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86400000);
}

// ---------------- Ciclo financeiro ----------------
/** Dia 1 = mês civil (padrão). Dias 2..28 deslocam o período. */
export const CALENDAR_CYCLE_DAY = 1;
export const MAX_CYCLE_DAY = 28;

export function normalizeCycleDay(day: number): number {
  if (!Number.isFinite(day)) return CALENDAR_CYCLE_DAY;
  return Math.min(MAX_CYCLE_DAY, Math.max(1, Math.round(day)));
}

/**
 * De qual mês o ciclo leva o nome: ciclos que começam na segunda metade do mês
 * pertencem ao mês seguinte (ex.: começa dia 25/08 → ciclo de Setembro).
 */
function cycleShift(startDay: number): number {
  return startDay > 15 ? 1 : 0;
}

/** Primeiro dia do ciclo chamado `cycle`. */
export function cycleStart(cycle: string, startDay: number): string {
  const d = normalizeCycleDay(startDay);
  if (d === 1) return `${cycle}-01`;
  return dateInMonth(addMonths(cycle, -cycleShift(d)), d);
}

/** Último dia do ciclo (inclusive). */
export function cycleEnd(cycle: string, startDay: number): string {
  const d = normalizeCycleDay(startDay);
  if (d === 1) return dateInMonth(cycle, 31);
  const next = fromISODate(cycleStart(addMonths(cycle, 1), d));
  next.setDate(next.getDate() - 1);
  return toISODate(next);
}

/** Ciclo em que uma data cai. */
export function cycleOf(date: string, startDay: number): string {
  const d = normalizeCycleDay(startDay);
  if (d === 1) return monthOf(date);
  const m = monthOf(date);
  const base = date >= dateInMonth(m, d) ? m : addMonths(m, -1);
  return addMonths(base, cycleShift(d));
}

/** Data dentro do ciclo com o dia pedido (ex.: vencimento de uma conta fixa). */
export function dateInCycle(cycle: string, day: number, startDay: number): string {
  const d = normalizeCycleDay(startDay);
  if (d === 1) return dateInMonth(cycle, day);
  const start = cycleStart(cycle, d);
  const first = dateInMonth(monthOf(start), day);
  return first >= start ? first : dateInMonth(addMonths(monthOf(start), 1), day);
}

/** Período do ciclo em texto curto: "06/09 → 05/10". */
export function cycleRange(cycle: string, startDay: number): string {
  return `${formatDate(cycleStart(cycle, startDay))} → ${formatDate(cycleEnd(cycle, startDay))}`;
}
