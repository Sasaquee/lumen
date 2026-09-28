import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { CategoryIcon, Icon, T } from './ui';
import { useStore } from '../data/store';
import { isPendingCharge, type Invoice, type Item } from '../data/engine';
import { formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';

/** Fixos mensais cobrados no cartão, das faturas pagas no ciclo. */
export function cardFixedItems(invoices: Invoice[]): Item[] {
  return invoices
    .flatMap((inv) => inv.items.filter((i) => i.source === 'recurring'))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** O que dos fixos do cartão o banco ainda não cobrou: já está no total, mas é previsão. */
export function pendingCardFixed(invoices: Invoice[]): number {
  return cardFixedItems(invoices).filter((i) => isPendingCharge(i)).reduce((s, i) => s + i.amount, 0);
}

/**
 * Assinatura ou conta fixa que passa no cartão. O valor já está dentro da fatura, então a
 * linha só mostra — pagar é pagar a fatura. "Previsto" é o fixo que o banco ainda não
 * cobrou: ele entra na fatura pelo fechamento do cartão e já conta na projeção.
 */
export function CardFixedRow({ item: it }: { item: Item }) {
  const { ledger } = useStore();
  const nav = useNavigation();
  const card = ledger.card(it.cardId);
  const cat = ledger.category(it.categoryId);
  const pending = isPendingCharge(it);
  return (
    <Pressable
      onPress={() => nav.navigate('Invoice', { cardId: it.cardId!, month: it.invoiceMonth! })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
    >
      <CategoryIcon icon={cat?.icon ?? 'repeat'} color={cat?.color} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15} weight="medium" numberOfLines={1}>{it.description}</T>
        <T size={12} color={colors.muted} numberOfLines={1}>
          {card?.name} · {pending ? 'cobra' : 'cobrou'} {formatDate(it.date)} · fatura vence {formatDate(it.dueDate)}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T size={15} weight="semibold">{formatMoney(it.amount)}</T>
        {it.paid ? (
          <View style={styles.tag}><Icon name="check" size={12} color={colors.primary} /><T size={11} color={colors.primary}>fatura paga</T></View>
        ) : pending ? (
          <T size={11} color={colors.warning}>previsto</T>
        ) : (
          <T size={11} color={colors.muted}>na fatura</T>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
