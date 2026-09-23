import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { colors } from '../theme';
import {
  Button, Card, CategoryIcon, Checkbox, Chip, Divider, EmptyState, Icon, MonthSwitcher,
  SectionTitle, Segmented, Sheet, SheetAction, T, tap,
} from '../components/ui';
import { ItemRow } from '../components/ItemRow';
import { useStore } from '../data/store';
import * as db from '../data/db';
import type { Item } from '../data/engine';
import type { TabParamList } from '../navigation/types';
import {
  DEFAULT_SORT, expenseGroups, matchesGroups, SORTS, sortItems, sortLabel, type Sort,
} from '../data/filters';
import { formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';

type Filter = 'all' | 'expense' | 'income';
type Status = 'all' | 'paid' | 'unpaid';

const STATUS: { value: Status; label: string; icon: string }[] = [
  { value: 'all', label: 'Todos', icon: 'checkbox-multiple-blank-outline' },
  { value: 'paid', label: 'Pagos', icon: 'check-circle-outline' },
  { value: 'unpaid', label: 'Pendentes', icon: 'clock-outline' },
];
const statusLabel = (v: Status) => STATUS.find((o) => o.value === v)!.label;

export default function MonthScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const route = useRoute<RouteProp<TabParamList, 'Month'>>();
  const { ledger, month, setMonth, refresh } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [sortSheet, setSortSheet] = useState(false);
  const [status, setStatus] = useState<Status>('all');
  const [statusSheet, setStatusSheet] = useState(false);

  // filtros vindos de outra tela (ex.: tocar num grupo no gráfico do Início)
  useEffect(() => {
    const p = route.params;
    if (!p) return;
    if (p.groups) { setGroups(new Set(p.groups)); setFilter('all'); }
    if (p.sort) setSort(p.sort);
    if (p.status) setStatus(p.status);
  }, [route.params]);

  const data = ledger.month(month);
  const t = data.totals;
  const allGroups = useMemo(() => expenseGroups(ledger, month), [ledger, month]);
  // o chip ativo pode estar fora da area visivel, entao a barra de filtros diz quais sao
  const selectedLabel = useMemo(() => {
    const picked = allGroups.filter((g) => groups.has(g.key));
    if (picked.length === 0) return '';
    if (picked.length > 2) return `${picked.length} grupos`;
    return picked.map((g) => g.label).join(', ');
  }, [allGroups, groups]);

  const keepStatus = (paid: boolean) => status === 'all' || (status === 'paid' ? paid : !paid);
  const keep = (i: Item) => keepStatus(i.paid);
  const groupsActive = groups.size > 0 && filter !== 'income';
  const flat = groupsActive || sort !== DEFAULT_SORT;
  const filtering = groups.size > 0 || sort !== DEFAULT_SORT || filter !== 'all' || status !== 'all';

  const incomes = filter === 'expense' || groupsActive ? [] : data.incomes.filter(keep);
  // na lista plana as despesas incluem os itens de fatura; na seccionada, só o que está fora do cartão
  const expenses = filter === 'income'
    ? []
    : (flat ? ledger.listItems(month) : data.expenses)
      .filter(keep)
      .filter((i) => !groupsActive || matchesGroups(i, groups));

  const toggleGroup = (key: string) => {
    tap();
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const clearFilters = () => {
    tap();
    setGroups(new Set());
    setSort(DEFAULT_SORT);
    setFilter('all');
    setStatus('all');
    nav.setParams({ groups: undefined, sort: undefined, status: undefined, ts: undefined } as never);
  };

  const fixed = expenses.filter((i) => i.source === 'recurring');
  const others = expenses.filter((i) => i.source !== 'recurring');
  const invoices = filter === 'income' || flat ? [] : data.invoices.filter((i) => keepStatus(i.paid));
  const flatList = flat ? sortItems([...expenses, ...incomes], sort) : [];
  const flatTotal = flatList.reduce((s, i) => s + (i.kind === 'income' ? 0 : i.amount), 0);
  const flatHasIncome = flatList.some((i) => i.kind === 'income');

  const empty = flat ? flatList.length === 0 : incomes.length + expenses.length + invoices.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
        <T size={24} weight="extrabold" style={{ letterSpacing: -0.5, paddingHorizontal: 2 }}>Lançamentos</T>
        <MonthSwitcher month={month} onChange={setMonth} hint={ledger.customCycle ? ledger.cycleRange(month) : undefined} />
        <View style={styles.summary}>
          <Summary label="Receitas" value={t.income} color={colors.income} />
          <Summary label="Despesas" value={t.expense} color={colors.expense} />
          <Summary label="Sobra" value={t.balance} color={t.balance >= 0 ? colors.primary : colors.danger} bold />
        </View>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'expense', label: 'Despesas' },
            { value: 'income', label: 'Receitas' },
          ]}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => { tap(); setSortSheet(true); }} style={styles.sortBtn}>
            <Icon name="sort-variant" size={18} color={sort === DEFAULT_SORT ? colors.textSecondary : colors.primary} />
            <T size={13} weight="medium" color={sort === DEFAULT_SORT ? colors.textSecondary : colors.primary}>Ordenar</T>
          </Pressable>
          <Pressable onPress={() => { tap(); setStatusSheet(true); }} style={[styles.sortBtn, status !== 'all' && styles.sortBtnOn]}>
            <Icon name={STATUS.find((o) => o.value === status)!.icon} size={18} color={status === 'all' ? colors.textSecondary : colors.primary} />
            <T size={13} weight="medium" color={status === 'all' ? colors.textSecondary : colors.primary}>
              {status === 'all' ? 'Status' : statusLabel(status)}
            </T>
          </Pressable>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 8, paddingRight: 8, alignItems: 'center' }}
          >
            {allGroups.map((g) => (
              <Chip
                key={g.key}
                label={g.label}
                icon={g.icon}
                color={g.color}
                active={groups.has(g.key)}
                onPress={() => toggleGroup(g.key)}
              />
            ))}
          </ScrollView>
        </View>

        {filtering ? (
          <View style={styles.filterBar}>
            <Icon name="filter-variant" size={15} color={colors.primary} />
            <T size={12.5} color={colors.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
              {selectedLabel ? `${selectedLabel} · ` : ''}{status !== 'all' ? `${statusLabel(status)} · ` : ''}{sortLabel(sort)}
            </T>
            <Pressable onPress={clearFilters} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="close-circle-outline" size={15} color={colors.primary} />
              <T size={12.5} weight="semibold" color={colors.primary}>Limpar filtros</T>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        {empty ? (
          <Card style={{ marginTop: 16 }}>
            <EmptyState
              icon={status === 'unpaid' ? 'check-all' : filtering ? 'filter-remove-outline' : 'calendar-blank-outline'}
              title={status === 'unpaid' ? 'Tudo em dia!' : filtering ? 'Nada neste filtro' : 'Nada lançado neste mês'}
              text={
                status === 'unpaid'
                  ? 'Nenhuma conta pendente neste período.'
                  : filtering ? 'Nenhum lançamento com esses filtros.' : 'Adicione receitas, contas fixas ou compras.'
              }
              action={
                filtering
                  ? <Button title="Limpar filtros" icon="close" variant="secondary" onPress={clearFilters} />
                  : <Button title="Adicionar" icon="plus" onPress={() => nav.navigate('EntryForm', {})} />
              }
            />
          </Card>
        ) : null}

        {flat && flatList.length > 0 ? (
          <Section
            title={`${flatList.length} ${flatList.length === 1 ? 'lançamento' : 'lançamentos'}`}
            total={flatTotal}
            totalLabel={flatHasIncome ? 'Despesas ' : undefined}
          >
            {flatList.map((i, idx) => <Row key={i.key} item={i} month={month} divider={idx > 0} />)}
          </Section>
        ) : null}

        {!flat && incomes.length > 0 ? (
          <Section title="Receitas" total={incomes.reduce((s, i) => s + i.amount, 0)}>
            {incomes.map((i, idx) => <Row key={i.key} item={i} month={month} divider={idx > 0} />)}
          </Section>
        ) : null}

        {invoices.length > 0 ? (
          <>
            <SectionTitle title="Faturas de cartão" right={<T size={13} color={colors.textSecondary}>{formatMoney(invoices.reduce((s, i) => s + i.total, 0))}</T>} />
            <Card padded={false} style={{ paddingVertical: 4 }}>
              {invoices.map((inv, idx) => (
                <View key={inv.key}>
                  {idx > 0 && <Divider />}
                  <Pressable onPress={() => nav.navigate('Invoice', { cardId: inv.card.id, month: inv.month })} style={styles.invoiceRow}>
                    <CategoryIcon icon="credit-card-outline" color={inv.card.color} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T size={15} weight="medium">{inv.card.name}</T>
                      <T size={12.5} color={colors.muted}>
                        Vence {formatDate(inv.dueDate)} · {inv.declaredTotal != null
                          ? 'total informado'
                          : `${inv.items.length} ${inv.items.length === 1 ? 'item' : 'itens'}`}
                      </T>
                    </View>
                    <T size={15} weight="semibold">{formatMoney(inv.total)}</T>
                    <Checkbox checked={inv.paid} onPress={() => { db.setPaid(inv.key, !inv.paid); refresh(); }} />
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {!flat && fixed.length > 0 ? (
          <Section title="Contas fixas" total={fixed.reduce((s, i) => s + i.amount, 0)}>
            {fixed.map((i, idx) => <Row key={i.key} item={i} month={month} divider={idx > 0} />)}
          </Section>
        ) : null}

        {!flat && others.length > 0 ? (
          <Section title="Parcelas e avulsos" total={others.reduce((s, i) => s + i.amount, 0)}>
            {others.map((i, idx) => <Row key={i.key} item={i} month={month} divider={idx > 0} />)}
          </Section>
        ) : null}

        {!empty ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 18 }}>
            <Icon name="gesture-tap" size={15} color={colors.muted} />
            <T size={12.5} color={colors.muted} align="center" style={{ flex: 1 }}>
              Toque em um item para editar, ajustar o valor ou excluir.{'\n'}
              Os gastos do cartão ficam dentro da fatura.
            </T>
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={statusSheet} onClose={() => setStatusSheet(false)} title="Mostrar">
        {STATUS.map((o) => (
          <SheetAction
            key={o.value}
            icon={o.value === status ? 'check' : o.icon}
            label={o.label}
            color={o.value === status ? colors.primary : colors.text}
            onPress={() => { setStatus(o.value); setStatusSheet(false); }}
          />
        ))}
      </Sheet>

      <Sheet visible={sortSheet} onClose={() => setSortSheet(false)} title="Ordenar por">
        {SORTS.map((o) => (
          <SheetAction
            key={o.value}
            icon={o.value === sort ? 'check' : o.icon}
            label={o.label}
            color={o.value === sort ? colors.primary : colors.text}
            onPress={() => { setSort(o.value); setSortSheet(false); }}
          />
        ))}
      </Sheet>
    </View>
  );
}

function Row({ item, month, divider }: { item: Item; month: string; divider: boolean }) {
  return (
    <>
      {divider && <Divider />}
      <ItemRow item={item} month={month} />
    </>
  );
}

function Section({ title, total, totalLabel, children }: {
  title: string; total: number; totalLabel?: string; children: React.ReactNode;
}) {
  return (
    <>
      <SectionTitle title={title} right={<T size={13} color={colors.textSecondary}>{totalLabel}{formatMoney(total)}</T>} />
      <Card padded={false} style={{ paddingVertical: 4 }}>{children}</Card>
    </>
  );
}

function Summary({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T size={12} color={colors.muted}>{label}</T>
      <T size={14.5} weight={bold ? 'bold' : 'semibold'} color={color} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(value)}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sortBtnOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
