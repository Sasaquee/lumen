import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Button, Card, Checkbox, EmptyState, Icon, SectionTitle, Sheet, T, tap } from './ui';
import { CategoryDonut } from './Charts';
import { useStore } from '../data/store';
import { CARD_CATEGORY, UNDETAILED_CATEGORY, type CardMode } from '../data/engine';
import { catGroup, GROUP_CARD, GROUP_NONE } from '../data/filters';
import { formatDate, fromISODate, monthLabel, toISODate, today } from '../utils/dates';
import { formatMoney } from '../utils/money';

type Range = { from: string; to: string };

const shiftDays = (date: string, n: number) => {
  const d = fromISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

/** Gastos por categoria, com período por dia, seleção de categorias e cartão agrupado ou aberto. */
export function CategoryBreakdown() {
  const { ledger, month } = useStore();
  const nav = useNavigation();
  const [cardMode, setCardMode] = useState<CardMode>('grouped');
  const [range, setRange] = useState<Range | null>(null);
  const [hidden, setHidden] = useState<Set<number | null>>(new Set());
  const [sheet, setSheet] = useState<null | 'period' | 'cats'>(null);
  const [draft, setDraft] = useState<Range>({ from: shiftDays(today(), -6), to: today() });

  const rows = useMemo(
    () => (range ? ledger.byCategoryRange(range.from, range.to, cardMode) : ledger.byCategory(month, cardMode)),
    [ledger, month, cardMode, range],
  );

  const visible = rows.filter((r) => !hidden.has(r.id));
  const totalAll = rows.reduce((s, r) => s + r.value, 0);
  const totalVisible = visible.reduce((s, r) => s + r.value, 0);
  const filtered = visible.length !== rows.length;

  const periodLabel = range ? `${formatDate(range.from)} → ${formatDate(range.to)}` : monthLabel(month).split(' ')[0];

  const toggleCat = (id: number | null) => {
    tap();
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pick = (which: 'from' | 'to') => {
    DateTimePickerAndroid.open({
      value: fromISODate(draft[which]),
      mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const v = toISODate(d);
        setDraft((prev) => (which === 'from'
          ? { from: v, to: prev.to < v ? v : prev.to }
          : { from: prev.from > v ? v : prev.from, to: v }));
      },
    });
  };

  const applyPreset = (days: number) => {
    setRange({ from: shiftDays(today(), -(days - 1)), to: today() });
    setSheet(null);
  };

  // uma fatia vira filtro na aba Mês; agrupado, as categorias excluem o que está no cartão
  const openGroup = (ids: (number | null)[]) => {
    const groups = ids.map((id) => {
      if (id === CARD_CATEGORY.id) {
        return cardMode === 'grouped' ? GROUP_CARD : catGroup(UNDETAILED_CATEGORY.id);
      }
      return id == null ? GROUP_NONE : catGroup(id);
    });
    nav.navigate('Tabs', { screen: 'Month', params: { groups, ts: Date.now() } } as never);
  };

  return (
    <>
      <SectionTitle title="Gastos por categoria" />
      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
          <Pressable onPress={() => { tap(); setSheet('period'); }} style={[styles.pill, range && styles.pillOn]}>
            <Icon name="calendar-range-outline" size={16} color={range ? colors.primary : colors.textSecondary} />
            <T size={13} weight="medium" color={range ? colors.primary : colors.textSecondary}>{periodLabel}</T>
          </Pressable>
          <Pressable onPress={() => { tap(); setSheet('cats'); }} style={[styles.pill, filtered && styles.pillOn]}>
            <Icon name="tag-multiple-outline" size={16} color={filtered ? colors.primary : colors.textSecondary} />
            <T size={13} weight="medium" color={filtered ? colors.primary : colors.textSecondary}>
              {filtered ? `${visible.length} de ${rows.length}` : 'Categorias'}
            </T>
          </Pressable>
          <Pressable
            onPress={() => { tap(); setCardMode((m) => (m === 'grouped' ? 'open' : 'grouped')); }}
            style={[styles.pill, cardMode === 'open' && styles.pillOn]}
          >
            <Icon name="credit-card-outline" size={16} color={cardMode === 'open' ? colors.primary : colors.textSecondary} />
            <T size={13} weight="medium" color={cardMode === 'open' ? colors.primary : colors.textSecondary}>
              {cardMode === 'grouped' ? 'Abrir cartões' : 'Agrupar cartões'}
            </T>
          </Pressable>
        </ScrollView>

        {visible.length ? (
          <>
            <CategoryDonut data={visible} onSelect={openGroup} />
            {filtered ? (
              <T size={12.5} color={colors.muted} align="center" style={{ marginTop: 4 }}>
                {formatMoney(totalVisible)} de {formatMoney(totalAll)} ({Math.round((totalVisible / totalAll) * 100)}% do período)
              </T>
            ) : null}
            {cardMode === 'open' ? (
              <T size={12.5} color={colors.muted} align="center" style={{ marginTop: 4 }}>
                O que não está detalhado continua em Cartão de crédito.
              </T>
            ) : null}
            {range ? (
              <T size={12.5} color={colors.muted} align="center" style={{ marginTop: 4 }}>
                Período próprio — não acompanha o mês selecionado acima.
              </T>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="chart-donut"
            title={rows.length ? 'Nenhuma categoria selecionada' : 'Sem despesas no período'}
            action={rows.length ? <Button title="Mostrar todas" variant="secondary" onPress={() => setHidden(new Set())} /> : undefined}
          />
        )}
      </Card>

      {/* ---------- período ---------- */}
      <Sheet visible={sheet === 'period'} onClose={() => setSheet(null)} title="Período do gráfico">
        <View style={{ paddingHorizontal: 8, gap: 10 }}>
          <Option
            label={`Mês selecionado · ${monthLabel(month)}`}
            hint={ledger.cycleRange(month)}
            active={!range}
            onPress={() => { setRange(null); setSheet(null); }}
          />
          <Option label="Últimos 7 dias" active={false} onPress={() => applyPreset(7)} />
          <Option label="Últimos 30 dias" active={false} onPress={() => applyPreset(30)} />

          <View style={styles.custom}>
            <T size={13} weight="semibold">Período personalizado</T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DateBtn label="De" value={draft.from} onPress={() => pick('from')} />
              <DateBtn label="Até" value={draft.to} onPress={() => pick('to')} />
            </View>
            <Button
              title="Aplicar período"
              icon="check"
              onPress={() => { setRange({ ...draft }); setSheet(null); }}
            />
          </View>
        </View>
      </Sheet>

      {/* ---------- categorias ---------- */}
      <Sheet visible={sheet === 'cats'} onClose={() => setSheet(null)} title="Categorias no gráfico">
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 8, marginBottom: 6 }}>
          <Button title="Todas" variant="secondary" style={{ flex: 1, height: 42 }} onPress={() => setHidden(new Set())} />
          <Button
            title="Nenhuma"
            variant="secondary"
            style={{ flex: 1, height: 42 }}
            onPress={() => setHidden(new Set(rows.map((r) => r.id)))}
          />
        </View>
        <ScrollView style={{ maxHeight: 360 }}>
          {rows.map((r) => (
            <Pressable key={String(r.id)} onPress={() => toggleCat(r.id)} style={styles.catRow}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: r.category?.color ?? colors.muted }} />
              <T size={14.5} style={{ flex: 1 }} numberOfLines={1}>{r.category?.name ?? 'Sem categoria'}</T>
              <T size={13.5} color={colors.textSecondary}>{formatMoney(r.value)}</T>
              <Checkbox checked={!hidden.has(r.id)} onPress={() => toggleCat(r.id)} />
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

function Option({ label, hint, active, onPress }: { label: string; hint?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={[styles.option, active && styles.optionOn]}>
      <Icon name={active ? 'check-circle' : 'circle-outline'} size={20} color={active ? colors.primary : colors.muted} />
      <View style={{ flex: 1 }}>
        <T size={14.5} weight={active ? 'semibold' : 'regular'}>{label}</T>
        {hint ? <T size={12} color={colors.muted}>{hint}</T> : null}
      </View>
    </Pressable>
  );
}

function DateBtn({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={styles.dateBtn}>
      <T size={11.5} color={colors.muted}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="calendar-month-outline" size={16} color={colors.textSecondary} />
        <T size={15} weight="medium">{formatDate(value)}</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: 8, paddingBottom: 14, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34,
    borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
  },
  pillOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surface2 },
  optionOn: { backgroundColor: colors.primarySoft },
  custom: { gap: 10, backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginTop: 4 },
  dateBtn: { flex: 1, gap: 2, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
