import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Button, Card, Divider, EmptyState, ListRow, ProgressBar, SectionTitle, Segmented, T } from '../components/ui';
import { useStore } from '../data/store';
import type { Recurring } from '../data/types';
import { METHOD_LABELS } from '../data/types';
import { monthShort } from '../utils/dates';
import { formatMoney, installmentAmount } from '../utils/money';

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { ledger } = useStore();
  const [tab, setTab] = useState<'recurring' | 'installments'>('recurring');
  const now = ledger.currentCycle();

  const recs = ledger.snap.recurrings;
  const isActive = (r: Recurring) => r.start_month <= now && (!r.end_month || r.end_month >= now);
  const isFuture = (r: Recurring) => r.start_month > now;
  const activeExp = recs.filter((r) => r.kind === 'expense' && (isActive(r) || isFuture(r)));
  const activeInc = recs.filter((r) => r.kind === 'income' && (isActive(r) || isFuture(r)));
  const ended = recs.filter((r) => r.end_month && r.end_month < now);
  const sumActive = (list: Recurring[]) => list.filter(isActive).reduce((s, r) => s + r.amount_cents, 0);

  const plans = ledger.activeInstallments(now);
  const running = plans.filter((p) => !p.finished);
  const finished = plans.filter((p) => p.finished);
  const committed = running.reduce((s, p) => s + p.remaining, 0);
  const monthlyInst = running.filter((p) => p.current >= 1).reduce((s, p) => s + installmentAmount(p.entry.amount_cents, p.entry.installments, p.current - 1), 0);

  const recRow = (r: Recurring, idx: number) => {
    const cat = ledger.category(r.category_id);
    const card = ledger.card(r.card_id);
    const sub = [
      `Dia ${r.day}`,
      r.kind === 'expense' ? (card ? card.name : METHOD_LABELS[r.method]) : null,
      isFuture(r) ? `começa ${monthShort(r.start_month, true)}` : r.end_month ? `até ${monthShort(r.end_month, true)}` : null,
    ].filter(Boolean).join(' · ');
    return (
      <View key={r.id}>
        {idx > 0 && <Divider />}
        <ListRow
          icon={cat?.icon} iconColor={cat?.color} title={r.description} subtitle={sub}
          onPress={() => nav.navigate('EntryForm', { recurringId: r.id })}
          right={<T size={15} weight="semibold" color={r.kind === 'income' ? colors.income : colors.text}>{formatMoney(r.amount_cents)}</T>}
        />
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: 8, paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'recurring', label: 'Fixos mensais' }, { value: 'installments', label: 'Parcelamentos' }]} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        {tab === 'recurring' ? (
          <>
            <View style={styles.kpis}>
              <Kpi label="Receitas fixas" value={sumActive(activeInc)} color={colors.income} />
              <Kpi label="Despesas fixas" value={sumActive(activeExp)} color={colors.expense} />
            </View>
            <Card style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T color={colors.textSecondary}>Sobra só com os fixos</T>
              <T size={17} weight="bold" color={sumActive(activeInc) - sumActive(activeExp) >= 0 ? colors.primary : colors.danger}>
                {formatMoney(sumActive(activeInc) - sumActive(activeExp))}
              </T>
            </Card>

            {recs.length === 0 && (
              <Card style={{ marginTop: 16 }}>
                <EmptyState
                  icon="repeat" title="Nenhum fixo cadastrado"
                  text="Salário, aluguel, internet, academia, streaming... tudo que se repete todo mês."
                  action={<Button title="Adicionar fixo" icon="plus" onPress={() => nav.navigate('EntryForm', { mode: 'recurring' })} />}
                />
              </Card>
            )}
            {activeInc.length > 0 && (<><SectionTitle title="Receitas fixas" /><Card padded={false} style={{ paddingVertical: 4 }}>{activeInc.map(recRow)}</Card></>)}
            {activeExp.length > 0 && (<><SectionTitle title="Despesas fixas" /><Card padded={false} style={{ paddingVertical: 4 }}>{activeExp.map(recRow)}</Card></>)}
            {ended.length > 0 && (<><SectionTitle title="Encerrados" /><Card padded={false} style={{ paddingVertical: 4, opacity: 0.7 }}>{ended.map(recRow)}</Card></>)}
            {recs.length > 0 && <Button variant="ghost" title="Adicionar fixo" icon="plus" onPress={() => nav.navigate('EntryForm', { mode: 'recurring' })} style={{ marginTop: 12 }} />}
          </>
        ) : (
          <>
            <View style={styles.kpis}>
              <Kpi label="Parcelas neste mês" value={monthlyInst} color={colors.expense} />
              <Kpi label="Total a pagar" value={committed} color={colors.warning} />
            </View>
            {plans.length === 0 && (
              <Card style={{ marginTop: 16 }}>
                <EmptyState
                  icon="layers-triple-outline" title="Nenhum parcelamento"
                  text="Compras parceladas aparecem aqui com o progresso de cada uma."
                  action={<Button title="Adicionar parcelado" icon="plus" onPress={() => nav.navigate('EntryForm', { mode: 'installments' })} />}
                />
              </Card>
            )}
            {running.length > 0 && <SectionTitle title="Em andamento" />}
            {running.map((pl) => {
              const cat = ledger.category(pl.entry.category_id);
              const card = ledger.card(pl.entry.card_id);
              return (
                <Card key={pl.entry.id} padded={false} style={{ marginBottom: 10 }}>
                  <ListRow
                    icon={cat?.icon} iconColor={cat?.color} title={pl.entry.description}
                    subtitle={`${pl.entry.installments}x de ${formatMoney(installmentAmount(pl.entry.amount_cents, pl.entry.installments, 1))}${card ? ' · ' + card.name : ''}`}
                    onPress={() => nav.navigate('EntryForm', { entryId: pl.entry.id })}
                    right={<T size={15} weight="semibold">{formatMoney(pl.entry.amount_cents)}</T>}
                  />
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                    <ProgressBar value={pl.current / pl.entry.installments} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <T size={12.5} color={colors.muted}>
                        {pl.current === 0 ? `Começa em ${monthShort(pl.first, true)}` : `Parcela ${pl.current} de ${pl.entry.installments}`} · termina {monthShort(pl.last, true)}
                      </T>
                      <T size={12.5} color={colors.textSecondary}>Resta {formatMoney(pl.remaining)}</T>
                    </View>
                  </View>
                </Card>
              );
            })}
            {finished.length > 0 && (
              <>
                <SectionTitle title="Quitados" />
                <Card padded={false} style={{ paddingVertical: 4, opacity: 0.7 }}>
                  {finished.map((pl, idx) => {
                    const cat = ledger.category(pl.entry.category_id);
                    return (
                      <View key={pl.entry.id}>
                        {idx > 0 && <Divider />}
                        <ListRow icon={cat?.icon} iconColor={cat?.color} title={pl.entry.description} subtitle={`${pl.entry.installments}x · quitado em ${monthShort(pl.last, true)}`}
                          onPress={() => nav.navigate('EntryForm', { entryId: pl.entry.id })}
                          right={<T size={14} color={colors.textSecondary}>{formatMoney(pl.entry.amount_cents)}</T>} />
                      </View>
                    );
                  })}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card style={{ flex: 1, gap: 4 }}>
      <T size={12.5} color={colors.muted}>{label}</T>
      <T size={18} weight="bold" color={color} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(value)}</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
