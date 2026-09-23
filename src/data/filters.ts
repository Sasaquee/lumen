import type { Item, Ledger } from './engine';
import { UNDETAILED_CATEGORY } from './engine';

/** Grupo de gastos usado nos filtros da aba Mês. */
export interface ExpenseGroup {
  key: string;
  label: string;
  icon: string;
  color: string;
  /** Quanto esse grupo representa no mês (para ordenar os chips e mostrar o valor). */
  value: number;
}

export const GROUP_CARD = 'card';
export const GROUP_NONE = 'none';

/** Chave de grupo de uma categoria. */
export const catGroup = (id: number) => `cat:${id}`;

/** A que grupos um item pertence (cartão + categoria). */
export function itemGroups(item: Item): string[] {
  const out: string[] = [];
  if (item.cardId != null) out.push(GROUP_CARD);
  out.push(item.categoryId == null ? GROUP_NONE : catGroup(item.categoryId));
  return out;
}

/** Sem filtro, tudo passa; com filtro, basta o item pertencer a um dos grupos. */
export function matchesGroups(item: Item, groups: Set<string>) {
  if (groups.size === 0) return true;
  return itemGroups(item).some((g) => groups.has(g));
}

/**
 * Grupos oferecidos no filtro: cartão de crédito mais todas as categorias de despesa
 * cadastradas no app — criar uma categoria nova já a coloca aqui.
 */
export function expenseGroups(ledger: Ledger, month: string): ExpenseGroup[] {
  const items = ledger.listItems(month);
  const valueOf = new Map<string, number>();
  for (const it of items) {
    for (const g of itemGroups(it)) valueOf.set(g, (valueOf.get(g) ?? 0) + it.amount);
  }

  const out: ExpenseGroup[] = [];
  const seen = new Set<string>();
  const push = (key: string, label: string, icon: string, color: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label, icon, color, value: valueOf.get(key) ?? 0 });
  };

  if (ledger.snap.cards.some((c) => !c.archived) || valueOf.has(GROUP_CARD)) {
    push(GROUP_CARD, 'Cartão de crédito', 'credit-card-outline', '#9085E9');
  }
  for (const c of ledger.snap.categories) {
    if (c.kind !== 'expense') continue;
    const key = catGroup(c.id);
    if (c.archived && !valueOf.has(key)) continue; // arquivada só aparece se tiver gasto no mês
    push(key, c.name, c.icon, c.color);
  }
  // grupos que só existem por causa dos lançamentos do mês
  if (valueOf.has(catGroup(UNDETAILED_CATEGORY.id))) {
    push(catGroup(UNDETAILED_CATEGORY.id), UNDETAILED_CATEGORY.name, UNDETAILED_CATEGORY.icon, UNDETAILED_CATEGORY.color);
  }
  if (valueOf.has(GROUP_NONE)) push(GROUP_NONE, 'Sem categoria', 'tag-outline', '#6E7B89');

  // quem tem gasto no mês vem primeiro, do maior para o menor
  return out.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));
}

export type Sort = 'due-asc' | 'due-desc' | 'value-desc' | 'value-asc' | 'inst-desc' | 'inst-asc';

export const DEFAULT_SORT: Sort = 'due-asc';

export const SORTS: { value: Sort; label: string; icon: string }[] = [
  { value: 'due-asc', label: 'Vencimento mais próximo', icon: 'sort-calendar-ascending' },
  { value: 'due-desc', label: 'Vencimento mais distante', icon: 'sort-calendar-descending' },
  { value: 'value-desc', label: 'Maior valor', icon: 'sort-numeric-descending' },
  { value: 'value-asc', label: 'Menor valor', icon: 'sort-numeric-ascending' },
  { value: 'inst-desc', label: 'Mais parcelas', icon: 'sort-descending' },
  { value: 'inst-asc', label: 'Menos parcelas', icon: 'sort-ascending' },
];

export const sortLabel = (s: Sort) => SORTS.find((o) => o.value === s)?.label ?? '';

const installmentsOf = (i: Item) => i.installment?.total ?? 1;

/** Ordena uma cópia da lista; empates caem na data e depois na descrição. */
export function sortItems(items: Item[], sort: Sort): Item[] {
  const byDate = (a: Item, b: Item) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, 'pt-BR');
  const cmp: Record<Sort, (a: Item, b: Item) => number> = {
    'due-asc': byDate,
    'due-desc': (a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description, 'pt-BR'),
    'value-desc': (a, b) => b.amount - a.amount || byDate(a, b),
    'value-asc': (a, b) => a.amount - b.amount || byDate(a, b),
    'inst-desc': (a, b) => installmentsOf(b) - installmentsOf(a) || byDate(a, b),
    'inst-asc': (a, b) => installmentsOf(a) - installmentsOf(b) || byDate(a, b),
  };
  return [...items].sort(cmp[sort]);
}
