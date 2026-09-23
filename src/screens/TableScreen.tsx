import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Card, MonthSwitcher, SectionTitle, Segmented, T, tap } from '../components/ui';
import { useStore } from '../data/store';
import { addMonths, monthShort } from '../utils/dates';
import { formatMoney } from '../utils/money';

/** Valores na tabela vão sem "R$" para caber; a moeda fica no resumo acima. */
const num = (cents: number) => formatMoney(cents).replace('R$', '').trim();

const COLS = { value: 94, month: 66 };
const ROW_H = 52;

type Row = {
  month: string;
  income: number;
  expense: number;
  balance: number;
  /** Variação da sobra em relação ao mês anterior; null quando não dá para comparar. */
  variation: number | null;
};

export default function TableScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { ledger, month, setMonth } = useStore();
  const [span, setSpan] = useState<'6' | '12' | '24'>('12');

  const rows = useMemo<Row[]>(() => {
    const n = Number(span);
    const out: Row[] = [];
    // um mês a mais no começo só para calcular a variação do primeiro que aparece
    for (let i = -n; i <= 0; i++) {
      const m = addMonths(month, i);
      const t = ledger.month(m).totals;
      const prev = out[out.length - 1];
      out.push({
        month: m,
        income: t.income,
        expense: t.expense,
        balance: t.balance,
        variation: prev && prev.balance !== 0 ? (t.balance - prev.balance) / Math.abs(prev.balance) : null,
      });
    }
    return out.slice(1).reverse(); // mais recente primeiro
  }, [ledger, month, span]);

  const totals = rows.reduce(
    (a, r) => ({ income: a.income + r.income, expense: a.expense + r.expense, balance: a.balance + r.balance }),
    { income: 0, expense: 0, balance: 0 },
  );
  const n = Math.max(1, rows.length);
  const avg = { income: Math.round(totals.income / n), expense: Math.round(totals.expense / n), balance: Math.round(totals.balance / n) };
  const current = ledger.currentCycle();

  const open = (m: string) => {
    tap();
    setMonth(m);
    nav.navigate('Tabs', { screen: 'Month', params: { ts: Date.now() } } as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
        <T size={24} weight="extrabold" style={{ letterSpacing: -0.5, paddingHorizontal: 2 }}>Tabela</T>
        <MonthSwitcher month={month} onChange={setMonth} hint={ledger.customCycle ? ledger.cycleRange(month) : undefined} />
        <Segmented
          value={span}
          onChange={setSpan}
          options={[{ value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }, { value: '24', label: '24 meses' }]}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <Card style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Receitas" value={totals.income} color={colors.income} />
            <Stat label="Despesas" value={totals.expense} color={colors.expense} />
            <Stat label="Sobra" value={totals.balance} color={totals.balance >= 0 ? colors.primary : colors.danger} />
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Média/mês" value={avg.income} color={colors.income} small />
            <Stat label="Média/mês" value={avg.expense} color={colors.expense} small />
            <Stat label="Média/mês" value={avg.balance} color={avg.balance >= 0 ? colors.primary : colors.danger} small />
          </View>
        </Card>

        <SectionTitle title={`Últimos ${span} meses`} right={<T size={13} color={colors.textSecondary}>{rows.length} linhas</T>} />
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row' }}>
            {/* coluna fixa */}
            <View style={{ width: COLS.month, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
              <View style={[styles.head, { paddingLeft: 14 }]}>
                <T size={11.5} weight="semibold" color={colors.textSecondary}>MÊS</T>
              </View>
              {rows.map((r) => (
                <Pressable key={r.month} onPress={() => open(r.month)} style={[styles.cell, { paddingLeft: 14, alignItems: 'flex-start' }]}>
                  <T size={13.5} weight={r.month === current ? 'bold' : 'medium'} color={r.month === current ? colors.primary : colors.text}>
                    {monthShort(r.month, true)}
                  </T>
                </Pressable>
              ))}
              <View style={[styles.cell, styles.footRow, { paddingLeft: 14, alignItems: 'flex-start' }]}>
                <T size={12.5} weight="semibold" color={colors.textSecondary}>Total</T>
              </View>
            </View>

            {/* colunas roláveis */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[styles.head, { flexDirection: 'row' }]}>
                  <Head label="RECEITAS" w={COLS.value} />
                  <Head label="DESPESAS" w={COLS.value} />
                  <Head label="SOBRA" w={COLS.value} />
                </View>
                {rows.map((r) => (
                  <Pressable key={r.month} onPress={() => open(r.month)} style={{ flexDirection: 'row' }}>
                    <Cell w={COLS.value} text={num(r.income)} color={r.income ? colors.income : colors.muted} />
                    <Cell w={COLS.value} text={num(r.expense)} color={r.expense ? colors.expense : colors.muted} />
                    <Cell
                      w={COLS.value}
                      text={num(r.balance)}
                      color={r.balance >= 0 ? colors.text : colors.danger}
                      bold
                      note={r.variation == null ? undefined : `${r.variation > 0 ? '+' : ''}${Math.round(r.variation * 100)}%`}
                      noteColor={r.variation != null && r.variation >= 0 ? colors.primary : colors.danger}
                    />
                  </Pressable>
                ))}
                <View style={[styles.footRow, { flexDirection: 'row' }]}>
                  <Cell w={COLS.value} text={num(totals.income)} color={colors.income} bold />
                  <Cell w={COLS.value} text={num(totals.expense)} color={colors.expense} bold />
                  <Cell w={COLS.value} text={num(totals.balance)} color={totals.balance >= 0 ? colors.text : colors.danger} bold />
                </View>
              </View>
            </ScrollView>
          </View>
        </Card>

        <T size={12.5} color={colors.muted} align="center" style={{ marginTop: 12, lineHeight: 18 }}>
          A porcentagem embaixo da sobra é a variação em relação ao mês anterior.{'\n'}
          Toque em uma linha para abrir o mês.
        </T>
      </ScrollView>
    </View>
  );
}

function Head({ label, w }: { label: string; w: number }) {
  return (
    <View style={{ width: w, paddingRight: 12, alignItems: 'flex-end' }}>
      <T size={11.5} weight="semibold" color={colors.textSecondary}>{label}</T>
    </View>
  );
}

function Cell({ w, text, color, bold, note, noteColor }: {
  w: number; text: string; color: string; bold?: boolean; note?: string; noteColor?: string;
}) {
  return (
    <View style={[styles.cell, { width: w, paddingRight: 10 }]}>
      <T size={13} weight={bold ? 'semibold' : 'regular'} color={color} numberOfLines={1} adjustsFontSizeToFit>{text}</T>
      {note ? <T size={10.5} color={noteColor ?? colors.muted}>{note}</T> : null}
    </View>
  );
}

function Stat({ label, value, color, small }: { label: string; value: number; color: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T size={11.5} color={colors.muted}>{label}</T>
      <T size={small ? 13 : 15} weight={small ? 'medium' : 'semibold'} color={color} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(value)}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { height: 34, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cell: { height: ROW_H, justifyContent: 'center', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  footRow: { backgroundColor: colors.surface2, borderBottomWidth: 0 },
});
