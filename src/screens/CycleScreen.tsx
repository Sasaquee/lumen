import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Button, Card, Field, Icon, SectionTitle, Segmented, Stepper, T } from '../components/ui';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { CYCLE_START_DAY } from '../data/types';
import {
  addMonths, CALENDAR_CYCLE_DAY, cycleOf, cycleRange, cycleStart, formatDate, MAX_CYCLE_DAY, monthLabel, today,
} from '../utils/dates';

export default function CycleScreen({ navigation }: RootProps<'Cycle'>) {
  const insets = useSafeAreaInsets();
  const { ledger, refresh, setMonth } = useStore();
  const [mode, setMode] = useState<'calendar' | 'custom'>(ledger.customCycle ? 'custom' : 'calendar');
  const [day, setDay] = useState(ledger.customCycle ? ledger.cycleStartDay : 6);

  const effective = mode === 'calendar' ? CALENDAR_CYCLE_DAY : day;
  const now = cycleOf(today(), effective);
  const preview = [-1, 0, 1, 2].map((i) => addMonths(now, i));

  const save = () => {
    db.setSetting(CYCLE_START_DAY, String(effective));
    refresh();
    setMonth(now);
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 24 }}>
        <View style={styles.intro}>
          <Icon name="calendar-sync-outline" size={20} color={colors.primary} />
          <T size={13.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>
            Se você paga em um mês contas que só vencem no começo do mês seguinte, ajuste o dia em que o seu
            mês financeiro começa. O app passa a agrupar tudo por esse período.
          </T>
        </View>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'calendar', label: 'Mês civil' },
            { value: 'custom', label: 'Ciclo próprio' },
          ]}
        />

        {mode === 'custom' ? (
          <Field
            label="O mês financeiro começa no dia"
            hint={
              day > 15
                ? 'Começando na segunda metade do mês, o ciclo leva o nome do mês seguinte (como o salário que paga o mês que vem).'
                : 'O ciclo leva o nome do mês em que começa e termina no dia anterior do mês seguinte.'
            }
          >
            <Stepper value={day} onChange={setDay} min={2} max={MAX_CYCLE_DAY} format={(v) => `Dia ${v}`} />
          </Field>
        ) : (
          <View style={styles.note}>
            <Icon name="information-outline" size={18} color={colors.muted} />
            <T size={13} color={colors.textSecondary} style={{ flex: 1, lineHeight: 19 }}>
              Cada mês vai do dia 1 ao último dia, como no calendário.
            </T>
          </View>
        )}

        <View>
          <SectionTitle title="Como ficam os períodos" style={{ marginTop: 4 }} />
          <Card padded={false} style={{ paddingVertical: 6 }}>
            {preview.map((m) => (
              <View key={m} style={styles.row}>
                <T size={14.5} weight={m === now ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                  {monthLabel(m)}
                </T>
                <T size={13.5} color={m === now ? colors.primary : colors.textSecondary}>
                  {cycleRange(m, effective)}
                </T>
              </View>
            ))}
          </Card>
          <T size={12.5} color={colors.muted} style={{ paddingHorizontal: 6, marginTop: 8, lineHeight: 18 }}>
            Hoje está no período de {monthLabel(now)}, que começou em {formatDate(cycleStart(now, effective))}.
          </T>
        </View>

        <View style={styles.note}>
          <Icon name="shield-check-outline" size={18} color={colors.muted} />
          <T size={12.5} color={colors.muted} style={{ flex: 1, lineHeight: 18 }}>
            Nada é apagado ao mudar o ciclo: os lançamentos continuam com as mesmas datas e só são reagrupados
            nos períodos novos. Você pode voltar para o mês civil quando quiser.
          </T>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title="Salvar ciclo" icon="check" onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 },
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
