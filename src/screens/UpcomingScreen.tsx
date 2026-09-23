import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Card, CategoryIcon, Checkbox, Divider, EmptyState, Icon, MonthSwitcher, SectionTitle, T } from '../components/ui';
import { ItemRow } from '../components/ItemRow';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import type { Invoice, Item } from '../data/engine';
import { formatDate, today } from '../utils/dates';
import { formatMoney } from '../utils/money';

type Row = { date: string; item: Item } | { date: string; invoice: Invoice };

const isInvoice = (r: Row): r is { date: string; invoice: Invoice } => 'invoice' in r;

export default function UpcomingScreen({ navigation }: RootProps<'Upcoming'>) {
  const { ledger, month, setMonth, refresh } = useStore();
  const data = ledger.month(month);
  const now = today();

  const rows: Row[] = [
    ...data.expenses.filter((i) => !i.paid).map((item) => ({ date: item.date, item })),
    ...data.invoices.filter((i) => !i.paid).map((invoice) => ({ date: invoice.dueDate, invoice })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const overdue = rows.filter((r) => r.date < now);
  const ahead = rows.filter((r) => r.date >= now);
  const amount = (r: Row) => (isInvoice(r) ? r.invoice.total : r.item.amount);
  const sum = (list: Row[]) => list.reduce((s, r) => s + amount(r), 0);
  const total = sum(rows);

  const renderRow = (r: Row, idx: number) => (
    <View key={isInvoice(r) ? r.invoice.key : r.item.key}>
      {idx > 0 ? <Divider /> : null}
      {isInvoice(r) ? (
        <Pressable
          onPress={() => navigation.navigate('Invoice', { cardId: r.invoice.card.id, month: r.invoice.month })}
          style={styles.invoiceRow}
        >
          <CategoryIcon icon="credit-card-outline" color={r.invoice.card.color} />
          <View style={{ flex: 1, gap: 2 }}>
            <T size={15} weight="medium">Fatura {r.invoice.card.name}</T>
            <T size={12.5} color={r.date < now ? colors.danger : colors.muted}>
              {r.date < now ? 'Venceu' : 'Vence'} {formatDate(r.invoice.dueDate)}
              {r.invoice.declaredTotal != null ? ' · total informado' : ''}
            </T>
          </View>
          <T size={15} weight="semibold">{formatMoney(r.invoice.total)}</T>
          <Checkbox checked={r.invoice.paid} onPress={() => { db.setPaid(r.invoice.key, !r.invoice.paid); refresh(); }} />
        </Pressable>
      ) : (
        <ItemRow item={r.item} month={month} />
      )}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <MonthSwitcher month={month} onChange={setMonth} hint={ledger.customCycle ? ledger.cycleRange(month) : undefined} />

      <Card style={{ marginTop: 12, padding: 20, gap: 4 }}>
        <T size={13.5} color={colors.textSecondary}>Falta pagar</T>
        <T size={32} weight="extrabold" style={{ letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(total)}
        </T>
        <T size={13} color={colors.muted}>
          {rows.length} {rows.length === 1 ? 'conta em aberto' : 'contas em aberto'}
        </T>
        {overdue.length > 0 ? (
          <View style={styles.warn}>
            <Icon name="alert-circle-outline" size={18} color={colors.danger} />
            <T size={13} color={colors.textSecondary} style={{ flex: 1 }}>
              {overdue.length} {overdue.length === 1 ? 'conta vencida' : 'contas vencidas'} · {formatMoney(sum(overdue))}
            </T>
          </View>
        ) : null}
      </Card>

      {rows.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState icon="check-all" title="Tudo pago" text="Nenhuma conta em aberto neste período." />
        </Card>
      ) : null}

      {overdue.length > 0 ? (
        <>
          <SectionTitle title="Vencidas" right={<T size={13} color={colors.danger}>{formatMoney(sum(overdue))}</T>} />
          <Card padded={false} style={{ paddingVertical: 4, borderColor: 'rgba(242,109,109,0.3)' }}>
            {overdue.map(renderRow)}
          </Card>
        </>
      ) : null}

      {ahead.length > 0 ? (
        <>
          <SectionTitle title="A vencer" right={<T size={13} color={colors.textSecondary}>{formatMoney(sum(ahead))}</T>} />
          <Card padded={false} style={{ paddingVertical: 4 }}>{ahead.map(renderRow)}</Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  invoiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 10, marginTop: 12 },
});
