import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Card, CategoryIcon, EmptyState, Icon, MonthSwitcher, ProgressBar, SectionTitle, T, Button } from '../components/ui';
import { IncomeExpenseBars, PaidStatusPie, TrendLine } from '../components/Charts';
import { CategoryBreakdown } from '../components/CategoryBreakdown';
import { useStore } from '../data/store';
import { alertCount } from '../data/reminders';
import { addMonths, formatDate, monthLabel, today } from '../utils/dates';
import { formatMoney } from '../utils/money';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { ledger, month, setMonth } = useStore();
  const data = ledger.month(month);
  const t = data.totals;
  const isCurrent = month === ledger.currentCycle();

  // do ciclo selecionado para a frente: o que já passou está nas outras telas
  const ahead = useMemo(() => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const m = addMonths(month, i);
      const d = ledger.month(m).totals;
      out.push({ month: m, income: d.income, expense: d.expense });
    }
    return out;
  }, [ledger, month]);

  const upcoming = useMemo(() => {
    const list = [
      ...data.expenses.filter((i) => !i.paid).map((i) => ({ key: i.key, title: i.description, date: i.date, amount: i.amount, categoryId: i.categoryId as number | null, card: undefined as string | undefined, cardId: undefined as number | undefined, invoiceMonth: undefined as string | undefined })),
      ...data.invoices.filter((i) => !i.paid).map((i) => ({ key: i.key, title: `Fatura ${i.card.name}`, date: i.dueDate, amount: i.total, categoryId: null, card: i.card.color, cardId: i.card.id, invoiceMonth: i.month })),
    ];
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const payment = useMemo(() => {
    let paid = 0; let unpaid = 0; let paidCount = 0; let unpaidCount = 0;
    for (const i of data.expenses) {
      if (i.paid) { paid += i.amount; paidCount++; } else { unpaid += i.amount; unpaidCount++; }
    }
    for (const inv of data.invoices) {
      if (inv.total <= 0) continue;
      if (inv.paid) { paid += inv.total; paidCount++; } else { unpaid += inv.total; unpaidCount++; }
    }
    return { paid, unpaid, paidCount, unpaidCount };
  }, [data]);

  const alerts = useMemo(() => alertCount(ledger), [ledger]);

  const remaining = t.balance;
  const toPay = t.expense - t.expensePaid;
  const daysLeft = isCurrent ? Math.max(1, ledger.daysLeftIn(month)) : 0;
  const cashNow = t.incomeReceived - t.expensePaid;
  const spentRatio = t.income > 0 ? t.expense / t.income : t.expense > 0 ? 1 : 0;
  const hasAnything = ledger.snap.entries.length + ledger.snap.recurrings.length > 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 120 }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/logo-mark.png')} style={{ width: 34, height: 34 }} />
          <T size={24} weight="extrabold" style={{ letterSpacing: -0.5 }}>Lumen</T>
        </View>
        <Pressable onPress={() => nav.navigate('NotificationCenter')} hitSlop={10} style={styles.bell}>
          <Icon name={alerts > 0 ? 'bell-badge-outline' : 'bell-outline'} size={22} color={alerts > 0 ? colors.warning : colors.textSecondary} />
          {alerts > 0 ? (
            <View style={styles.badge}>
              <T size={10.5} weight="bold" color="#0B0F14">{alerts > 9 ? '9+' : alerts}</T>
            </View>
          ) : null}
        </Pressable>
      </View>

      <MonthSwitcher month={month} onChange={setMonth} hint={ledger.customCycle ? ledger.cycleRange(month) : undefined} style={{ marginBottom: 14 }} />

      {/* Hero: sobra prevista */}
      <Card style={{ padding: 20, borderColor: remaining >= 0 ? 'rgba(59,224,143,0.25)' : 'rgba(242,109,109,0.3)' }}>
        <T size={13.5} color={colors.textSecondary}>Sobra prevista em {monthLabel(month).split(' ')[0]}</T>
        <T size={38} weight="extrabold" color={remaining >= 0 ? colors.primary : colors.danger} style={{ letterSpacing: -1, marginTop: 2 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(remaining)}
        </T>
        <View style={{ marginTop: 14, gap: 8 }}>
          <ProgressBar value={spentRatio} color={spentRatio > 1 ? colors.danger : spentRatio > 0.85 ? colors.warning : colors.primary} />
          <T size={12.5} color={colors.muted}>
            {t.income > 0 ? `${Math.round(spentRatio * 100)}% da renda comprometida` : 'Cadastre suas receitas para ver quanto sobra'}
          </T>
        </View>
        <View style={styles.statsRow}>
          <Stat label="Receitas" value={t.income} color={colors.income} icon="arrow-down-circle" />
          <View style={styles.vDivider} />
          <Stat label="Despesas" value={t.expense} color={colors.expense} icon="arrow-up-circle" />
        </View>
        <View style={[styles.statsRow, { marginTop: 0, borderTopWidth: 0, paddingTop: 12 }]}>
          <Stat label="Já pago" value={t.expensePaid} />
          <View style={styles.vDivider} />
          <Stat label="Falta pagar" value={toPay} color={toPay > 0 ? colors.warning : undefined} />
        </View>
        {isCurrent && t.income > 0 ? (
          <View style={styles.tip}>
            <Icon name="wallet-outline" size={18} color={colors.primary} />
            <T size={13} color={colors.textSecondary} style={{ flex: 1 }}>
              Em caixa agora: <T size={13} weight="semibold">{formatMoney(cashNow)}</T>
              {remaining > 0 ? <> · livre por dia: <T size={13} weight="semibold">{formatMoney(Math.floor(remaining / daysLeft))}</T></> : null}
            </T>
          </View>
        ) : null}
      </Card>

      {/* Composição */}
      <View style={styles.compRow}>
        <Comp label="Fixos" value={t.fixed} icon="repeat" />
        <Comp label="Parcelas" value={t.installments} icon="layers-triple-outline" />
        <Comp label="Avulsos" value={t.oneOff} icon="receipt-text-outline" />
      </View>

      {!hasAnything ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState
            icon="rocket-launch-outline"
            title="Comece pelo que é fixo"
            text="Cadastre seu salário e suas contas recorrentes (aluguel, internet, assinaturas). O Lumen projeta automaticamente quanto vai sobrar em cada mês."
            action={<Button title="Adicionar lançamento" icon="plus" onPress={() => nav.navigate('EntryForm', {})} />}
          />
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <>
          <SectionTitle
            title="Próximos pagamentos"
            right={
              <Pressable onPress={() => nav.navigate('Upcoming')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <T size={13} weight="semibold" color={colors.primary}>Ver todos ({upcoming.length})</T>
                <Icon name="chevron-right" size={16} color={colors.primary} />
              </Pressable>
            }
          />
          <Card padded={false} style={{ paddingVertical: 6 }}>
            {upcoming.slice(0, 5).map((u) => (
              <Pressable
                key={u.key}
                onPress={() => (u.cardId ? nav.navigate('Invoice', { cardId: u.cardId, month: u.invoiceMonth ?? month }) : nav.navigate('Tabs', { screen: 'Month' } as never))}
                style={styles.upRow}
              >
                {u.card ? <CategoryIcon icon="credit-card-outline" color={u.card} size={36} /> : <CategoryIcon icon={ledger.category(u.categoryId)?.icon} color={ledger.category(u.categoryId)?.color} size={36} />}
                <View style={{ flex: 1 }}>
                  <T size={14.5} weight="medium" numberOfLines={1}>{u.title}</T>
                  <T size={12.5} color={u.date < today() ? colors.danger : colors.muted}>
                    {u.date < today() ? 'Venceu ' : 'Vence '}{formatDate(u.date)}
                  </T>
                </View>
                <T size={14.5} weight="semibold">{formatMoney(u.amount)}</T>
              </Pressable>
            ))}
            {upcoming.length > 5 ? (
              <Pressable onPress={() => nav.navigate('Upcoming')} style={styles.seeAll}>
                <T size={13.5} weight="semibold" color={colors.primary}>
                  Ver os outros {upcoming.length - 5}
                </T>
              </Pressable>
            ) : null}
          </Card>
        </>
      ) : null}

      <CategoryBreakdown />

      {payment.paid + payment.unpaid > 0 ? (
        <>
          <SectionTitle
            title="Pago x a pagar"
            right={<T size={13} color={colors.textSecondary}>{formatMoney(payment.paid + payment.unpaid)}</T>}
          />
          <Card>
            <PaidStatusPie
              paid={payment.paid}
              unpaid={payment.unpaid}
              paidCount={payment.paidCount}
              unpaidCount={payment.unpaidCount}
              onSelect={(status) => nav.navigate('Tabs', { screen: 'Month', params: { status, ts: Date.now() } } as never)}
            />
            <T size={12.5} color={colors.muted} align="center" style={{ marginTop: 10 }}>
              Toque para ver as contas
            </T>
          </Card>
        </>
      ) : null}

      <SectionTitle title="Receitas x despesas · deste mês em diante" />
      <Card>
        <IncomeExpenseBars key={month} months={ahead.slice(0, 6)} />
      </Card>

      <SectionTitle title="Projeção · 12 meses à frente" />
      <Card>
        <TrendLine months={ahead} currentIndex={0} />
      </Card>
    </ScrollView>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: string }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon ? <Icon name={icon} size={15} color={color} /> : null}
        <T size={12.5} color={colors.muted}>{label}</T>
      </View>
      <T size={16} weight="semibold" color={color && !icon ? color : colors.text} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(value)}</T>
    </View>
  );
}

function Comp({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} color={colors.textSecondary} />
        <T size={12.5} color={colors.textSecondary}>{label}</T>
      </View>
      <T size={14.5} weight="semibold" numberOfLines={1} adjustsFontSizeToFit>{formatMoney(value)}</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 2 },
  bell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  badge: {
    position: 'absolute', top: 3, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 14 },
  vDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 },
  compRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  seeAll: { alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: 4 },
});
