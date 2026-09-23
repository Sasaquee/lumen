import React, { useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { colors, font } from '../theme';
import { Icon, T } from './ui';
import { formatCompact, formatMoney } from '../utils/money';
import { monthLabel, monthShort } from '../utils/dates';
import type { Category } from '../data/types';

const axisText = { color: colors.muted, fontSize: 11, fontFamily: font.regular };

function useChartWidth() {
  const { width } = useWindowDimensions();
  return width - 32 - 32; // margem da tela + padding do card
}

/** Legenda simples com amostra de cor + rótulo (texto em tinta neutra). */
export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: i.dashed ? 2 : 10, borderRadius: 3, backgroundColor: i.color }} />
          <T size={12.5} color={colors.textSecondary}>{i.label}</T>
        </View>
      ))}
    </View>
  );
}

// ---------------- Pizza (donut) ----------------
/** `onSelect` recebe as categorias da fatia tocada ("Outras" traz todas as agrupadas). */
export function CategoryDonut({ data, onSelect }: {
  data: { category?: Category; id: number | null; value: number }[];
  onSelect?: (ids: (number | null)[], label: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  const slices = useMemo(() => {
    const top = data.slice(0, 7).map((d) => ({
      label: d.category?.name ?? 'Sem categoria',
      color: d.category?.color ?? colors.muted,
      value: d.value,
      ids: [d.id],
    }));
    const rest = data.slice(7);
    const restValue = rest.reduce((s, d) => s + d.value, 0);
    if (restValue > 0) top.push({ label: 'Outras', color: '#5B6673', value: restValue, ids: rest.map((d) => d.id) });
    return top;
  }, [data]);

  const select = (i: number) => onSelect?.(slices[i].ids, slices[i].label);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <PieChart
          data={slices.map((s) => ({ value: s.value, color: s.color }))}
          donut
          radius={104}
          innerRadius={72}
          extraRadius={6}
          innerCircleColor={colors.surface}
          strokeColor={colors.surface}
          strokeWidth={2}
          onPress={(_: unknown, index: number) => select(index)}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center', maxWidth: 130 }}>
              <T size={12} color={colors.muted} numberOfLines={1}>Total</T>
              <T size={17} weight="bold" numberOfLines={1} adjustsFontSizeToFit>{formatMoney(total)}</T>
            </View>
          )}
        />
      </View>
      <View style={{ gap: 2 }}>
        {slices.map((s, i) => (
          <Pressable
            key={s.label}
            onPress={() => select(i)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 6,
              borderRadius: 10, backgroundColor: pressed ? colors.surface2 : 'transparent',
            })}
          >
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
            <T size={14} style={{ flex: 1 }} numberOfLines={1}>{s.label}</T>
            <T size={13} color={colors.muted} style={{ width: 42, textAlign: 'right' }}>{Math.round((s.value / total) * 100)}%</T>
            <T size={14} weight="semibold" style={{ minWidth: 92, textAlign: 'right' }}>{formatMoney(s.value)}</T>
            {onSelect ? <Icon name="chevron-right" size={16} color={colors.muted} /> : null}
          </Pressable>
        ))}
      </View>
      {onSelect ? (
        <T size={12.5} color={colors.muted} align="center">Toque em um grupo para ver os lançamentos</T>
      ) : null}
    </View>
  );
}

// ---------------- Pizza: pago x a pagar ----------------
/** Quanto das despesas do período já saiu da conta. `onSelect` abre a lista filtrada. */
export function PaidStatusPie({ paid, unpaid, paidCount, unpaidCount, onSelect }: {
  paid: number;
  unpaid: number;
  paidCount: number;
  unpaidCount: number;
  onSelect?: (status: 'paid' | 'unpaid') => void;
}) {
  const total = paid + unpaid;
  const slices = [
    { key: 'paid' as const, label: 'Pago', color: colors.primary, value: paid, count: paidCount },
    { key: 'unpaid' as const, label: 'A pagar', color: colors.warning, value: unpaid, count: unpaidCount },
  ].filter((s) => s.value > 0);

  if (total === 0) return null;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <PieChart
          data={slices.map((s) => ({ value: s.value, color: s.color }))}
          radius={96}
          strokeColor={colors.surface}
          strokeWidth={2}
          onPress={(_: unknown, index: number) => onSelect?.(slices[index].key)}
        />
      </View>
      <View style={{ gap: 2 }}>
        {slices.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => onSelect?.(s.key)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 6,
              borderRadius: 10, backgroundColor: pressed ? colors.surface2 : 'transparent',
            })}
          >
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
            <View style={{ flex: 1 }}>
              <T size={14}>{s.label}</T>
              <T size={12} color={colors.muted}>{s.count} {s.count === 1 ? 'conta' : 'contas'}</T>
            </View>
            <T size={13} color={colors.muted} style={{ width: 42, textAlign: 'right' }}>{Math.round((s.value / total) * 100)}%</T>
            <T size={14} weight="semibold" style={{ minWidth: 92, textAlign: 'right' }}>{formatMoney(s.value)}</T>
            {onSelect ? <Icon name="chevron-right" size={16} color={colors.muted} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------- Barras: receitas x despesas ----------------
export function IncomeExpenseBars({ months }: { months: { month: string; income: number; expense: number }[] }) {
  const width = useChartWidth();
  const [selected, setSelected] = useState(0);
  const n = months.length;
  const yLabel = 44;
  const group = (width - yLabel - 16) / n;
  const barWidth = Math.max(8, Math.min(18, group * 0.3));
  const gap = 3;
  const between = group - barWidth * 2 - gap;

  const data = months.flatMap((m, i) => {
    const dim = i === selected ? 1 : 0.55;
    return [
      {
        value: m.income / 100, frontColor: withAlpha(colors.income, dim), spacing: gap,
        label: monthShort(m.month), labelWidth: barWidth * 2 + gap,
        labelTextStyle: { ...axisText, color: i === selected ? colors.text : colors.muted, textAlign: 'center' as const },
        onPress: () => setSelected(i),
      },
      { value: m.expense / 100, frontColor: withAlpha(colors.expense, dim), spacing: between, onPress: () => setSelected(i) },
    ];
  });

  const cur = months[selected];
  const maxVal = Math.max(1, ...months.flatMap((m) => [m.income, m.expense])) / 100;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <T size={12.5} color={colors.muted}>{monthLabel(cur.month)}</T>
          <T size={15} weight="semibold" color={cur.income - cur.expense >= 0 ? colors.primary : colors.danger}>
            Sobra {formatMoney(cur.income - cur.expense)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T size={12.5} color={colors.textSecondary}>Receitas {formatMoney(cur.income)}</T>
          <T size={12.5} color={colors.textSecondary}>Despesas {formatMoney(cur.expense)}</T>
        </View>
      </View>
      <BarChart
        data={data}
        width={width - yLabel}
        height={170}
        barWidth={barWidth}
        initialSpacing={between / 2}
        endSpacing={0}
        barBorderTopLeftRadius={4}
        barBorderTopRightRadius={4}
        noOfSections={4}
        maxValue={niceMax(maxVal)}
        yAxisLabelWidth={yLabel}
        yAxisTextStyle={axisText}
        formatYLabel={(v: string) => formatCompact(Number(v) * 100)}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={colors.surface3}
        rulesColor={colors.grid}
        rulesType="solid"
        disableScroll
        disablePress={false}
      />
      <Legend items={[{ color: colors.income, label: 'Receitas' }, { color: colors.expense, label: 'Despesas' }]} />
    </View>
  );
}

// ---------------- Linhas: tendência histórica ----------------
export function TrendLine({ months, currentIndex }: { months: { month: string; income: number; expense: number }[]; currentIndex: number }) {
  const width = useChartWidth();
  const yLabel = 44;
  const n = months.length;
  const spacing = (width - yLabel - 24) / (n - 1);
  const maxVal = Math.max(1, ...months.flatMap((m) => [m.income, m.expense])) / 100;

  const toPoints = (key: 'income' | 'expense') => months.map((m, i) => ({
    value: m[key] / 100,
    label: i === currentIndex || (i % 3 === 0 && Math.abs(i - currentIndex) > 1) ? monthShort(m.month) : '',
    labelTextStyle: { ...axisText, width: 36, color: i === currentIndex ? colors.text : colors.muted },
  }));

  const dashed = currentIndex < n - 1 ? [{ startIndex: currentIndex, endIndex: n - 1, strokeDashArray: [5, 5] }] : undefined;
  const withExpense = months.filter((m) => m.expense > 0);
  const avg = withExpense.length ? withExpense.reduce((s, m) => s + m.expense, 0) / withExpense.length : 0;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <T size={12.5} color={colors.muted}>Média de despesas no período</T>
          <T size={15} weight="semibold">{formatMoney(Math.round(avg))}/mês</T>
        </View>
        <T size={12} color={colors.muted} style={{ alignSelf: 'flex-end' }}>Toque e arraste no gráfico</T>
      </View>
      <LineChart
        data={toPoints('expense')}
        data2={toPoints('income')}
        width={width - yLabel}
        height={170}
        spacing={spacing}
        initialSpacing={8}
        endSpacing={0}
        color1={colors.expense}
        color2={colors.income}
        thickness={2}
        curved
        curvature={0.15}
        hideDataPoints
        areaChart
        startFillColor1={colors.expense}
        endFillColor1={colors.expense}
        startOpacity1={0.18}
        endOpacity1={0}
        startFillColor2={colors.income}
        endFillColor2={colors.income}
        startOpacity2={0.08}
        endOpacity2={0}
        lineSegments={dashed}
        lineSegments2={dashed}
        noOfSections={4}
        maxValue={niceMax(maxVal)}
        yAxisLabelWidth={yLabel}
        yAxisTextStyle={axisText}
        formatYLabel={(v: string) => formatCompact(Number(v) * 100)}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={colors.surface3}
        rulesColor={colors.grid}
        rulesType="solid"
        disableScroll
        pointerConfig={{
          pointerStripColor: colors.muted,
          pointerStripWidth: 1,
          pointerStripUptoDataPoint: false,
          pointer1Color: colors.expense,
          pointer2Color: colors.income,
          radius: 5,
          activatePointersOnLongPress: false,
          autoAdjustPointerLabelPosition: true,
          pointerLabelWidth: 150,
          pointerLabelHeight: 70,
          shiftPointerLabelY: -10,
          pointerLabelComponent: (_items: unknown, _s: unknown, index: number) => {
            const m = months[index];
            if (!m) return null;
            return (
              <View style={{ backgroundColor: colors.surface3, borderRadius: 10, padding: 8, width: 150, borderWidth: 1, borderColor: colors.border }}>
                <T size={12} weight="semibold">{monthLabel(m.month)}{index > currentIndex ? ' (previsto)' : ''}</T>
                <T size={12} color={colors.textSecondary}>Despesas {formatMoney(m.expense)}</T>
                <T size={12} color={colors.textSecondary}>Receitas {formatMoney(m.income)}</T>
              </View>
            );
          },
        }}
      />
      <Legend items={[
        { color: colors.expense, label: 'Despesas' },
        { color: colors.income, label: 'Receitas' },
        ...(dashed ? [{ color: colors.muted, label: 'Tracejado = previsto', dashed: true }] : []),
      ]} />
    </View>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const raw = v * 1.1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= raw)! * pow;
  return step * 4;
}

function withAlpha(hex: string, a: number) {
  if (a >= 1) return hex;
  return hex + Math.round(a * 255).toString(16).padStart(2, '0');
}
