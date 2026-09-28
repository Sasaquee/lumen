import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Button, Card, Checkbox, Divider, EmptyState, Icon, MonthSwitcher, ProgressBar, SectionTitle, T } from '../components/ui';
import { LoanMonthsAhead, loanCycleTotal, PrepaySheet } from './LoansScreens';
import { useStore } from '../data/store';
import * as db from '../data/db';
import type { LoanSummary } from '../data/engine';
import { addMonths, currentMonth, formatDate, monthShort, today } from '../utils/dates';
import { formatMoney } from '../utils/money';

/**
 * Cartões e contratos do mês selecionado num lugar só: fatura de cada cartão, parcela de
 * cada empréstimo, e o botão de pagar ou antecipar ali mesmo. O mês segue o ciclo do
 * usuário, como as outras abas.
 */
export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { ledger, month, setMonth, refresh } = useStore();
  const [prepay, setPrepay] = useState<LoanSummary | null>(null);

  const data = ledger.month(month);
  const cards = ledger.snap.cards.filter((c) => !c.archived);
  const invoicesTotal = data.invoices.reduce((s, i) => s + i.total, 0);
  const loanItems = ledger.loanItems(month).filter((i) => i.kind === 'expense');
  const loansTotal = loanCycleTotal(loanItems);
  const summaries = ledger.snap.loans.map((l) => ledger.loanSummary(l));
  // contratos com algo neste mês, mais os que ainda correm
  const loans = summaries.filter((s) => !s.finished || loanItems.some((i) => i.loanId === s.loan.id));
  const short = monthShort(month);

  const toggle = (key: string, paid: boolean) => { db.setPaid(key, !paid); refresh(); };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 120 }}>
        <T size={24} weight="extrabold" style={{ letterSpacing: -0.5, paddingHorizontal: 2, marginBottom: 12 }}>Contas</T>
        <MonthSwitcher month={month} onChange={setMonth} hint={ledger.customCycle ? ledger.cycleRange(month) : undefined} />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Card style={{ flex: 1, gap: 4 }}>
            <View style={styles.statLabel}>
              <Icon name="credit-card-outline" size={15} color={colors.textSecondary} />
              <T size={12.5} color={colors.muted}>Faturas em {short}</T>
            </View>
            <T size={18} weight="bold" numberOfLines={1} adjustsFontSizeToFit>{formatMoney(invoicesTotal)}</T>
          </Card>
          <Card style={{ flex: 1, gap: 4 }}>
            <View style={styles.statLabel}>
              <Icon name="bank-outline" size={15} color={colors.textSecondary} />
              <T size={12.5} color={colors.muted}>Parcelas em {short}</T>
            </View>
            <T size={18} weight="bold" numberOfLines={1} adjustsFontSizeToFit>{formatMoney(loansTotal)}</T>
          </Card>
        </View>

        {/* ---------------- cartões */}
        <SectionTitle
          title="Cartões de crédito"
          right={cards.length ? <Link label="Gerenciar" onPress={() => nav.navigate('Cards')} /> : undefined}
        />
        {cards.length === 0 ? (
          <Card>
            <EmptyState
              icon="credit-card-plus-outline"
              title="Nenhum cartão"
              text="Cadastre o cartão com o dia de fechamento e vencimento para as compras caírem na fatura certa."
              action={<Button title="Adicionar cartão" icon="plus" onPress={() => nav.navigate('CardForm', {})} />}
            />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingVertical: 4 }}>
            {cards.map((c, i) => {
              const invs = data.invoices.filter((inv) => inv.card.id === c.id);
              const invoiceMonth = invs[0]?.month ?? ledger.invoiceMonthOfCycle(c, month);
              const total = invs.reduce((s, inv) => s + inv.total, 0);
              const paid = invs.length > 0 && invs.every((inv) => inv.paid);
              const used = ledger.cardCommitted(c.id, currentMonth());
              const available = c.limit_cents ? c.limit_cents - used : null;
              const due = invs[0]?.dueDate;
              return (
                <View key={c.id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    onPress={() => nav.navigate('Invoice', { cardId: c.id, month: invoiceMonth })}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
                  >
                    <View style={[styles.cardChip, { backgroundColor: c.color }]}>
                      <Icon name="credit-card-outline" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T size={15} weight="medium" numberOfLines={1}>{c.name}</T>
                      <T size={12} color={paid ? colors.primary : colors.muted}>
                        {paid ? 'Fatura paga' : due ? `Vence ${formatDate(due)}` : 'Sem fatura neste mês'}
                      </T>
                    </View>
                    <T size={15} weight="semibold">{formatMoney(total)}</T>
                    {invs.length && total > 0 ? (
                      <Checkbox checked={paid} onPress={() => invs.forEach((inv) => toggle(inv.key, paid))} />
                    ) : <View style={{ width: 24 }} />}
                  </Pressable>
                  {available != null ? (
                    <View style={styles.limit}>
                      <ProgressBar value={c.limit_cents ? used / c.limit_cents : 0} color={available < 0 ? colors.danger : c.color} />
                      <T size={11.5} color={available < 0 ? colors.danger : colors.muted}>
                        Limite restante {formatMoney(available)} de {formatMoney(c.limit_cents!)}
                      </T>
                    </View>
                  ) : null}
                  <View style={styles.actions}>
                    <Action icon="receipt-text-outline" label="Ver fatura" onPress={() => nav.navigate('Invoice', { cardId: c.id, month: invoiceMonth })} />
                    <Action icon="tray-arrow-down" label="Importar" onPress={() => nav.navigate('ImportInvoice', { cardId: c.id, month: invoiceMonth })} />
                    <Action icon="plus" label="Compra" onPress={() => nav.navigate('EntryForm', { kind: 'expense', method: 'cartao', cardId: c.id, invoiceMonth })} />
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {/* ---------------- empréstimos e financiamentos */}
        <SectionTitle
          title="Empréstimos e financiamentos"
          right={summaries.length ? <Link label="Ver todos" onPress={() => nav.navigate('Loans')} /> : undefined}
        />
        {loans.length === 0 ? (
          <Card>
            <EmptyState
              icon="bank-outline"
              title="Nenhum contrato em andamento"
              text="Cadastre empréstimos e financiamentos com todas as parcelas para ver o saldo devedor e quanto custa antecipar."
              action={<Button title="Novo contrato" icon="plus" onPress={() => nav.navigate('LoanForm', {})} />}
            />
          </Card>
        ) : (
          loans.map((s) => {
            const items = loanItems.filter((it) => it.loanId === s.loan.id);
            const n = s.parcels.length;
            const done = n - s.remainingCount;
            return (
              <Card key={s.loan.id} padded={false} style={{ marginBottom: 10 }}>
                <Pressable
                  onPress={() => nav.navigate('LoanDetail', { id: s.loan.id })}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <T size={15} weight="medium" numberOfLines={1}>{s.loan.description}</T>
                    <T size={12} color={colors.muted}>{s.finished ? 'Quitado' : `${done} de ${n} pagas · saldo ${formatMoney(s.remaining)}`}</T>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.muted} />
                </Pressable>
                {items.length ? items.map((it) => (
                  <View key={it.key} style={styles.item}>
                    <View style={{ flex: 1 }}>
                      <T size={13.5} numberOfLines={1}>
                        {it.installment ? `Parcela ${it.installment.index}/${it.installment.total}` : it.description}
                      </T>
                      <T size={12} color={it.paid ? colors.primary : it.date < today() ? colors.danger : colors.muted}>
                        {it.paid ? 'Paga' : `${it.date < today() ? 'Venceu' : 'Vence'} ${formatDate(it.date)}`}
                      </T>
                    </View>
                    <T size={14.5} weight="semibold">{formatMoney(it.amount)}</T>
                    <Checkbox checked={it.paid} onPress={() => toggle(it.key, it.paid)} />
                  </View>
                )) : (
                  <View style={styles.item}>
                    <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
                      Sem parcela em {short}{s.next ? ` · próxima ${formatDate(s.next.date)}` : ''}
                    </T>
                  </View>
                )}
                {!s.finished ? (
                  <View style={styles.actions}>
                    <Action icon="fast-forward" label="Antecipar" onPress={() => setPrepay(s)} />
                    <Action icon="file-document-outline" label="Contrato" onPress={() => nav.navigate('LoanDetail', { id: s.loan.id })} />
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
        {loans.length ? (
          <>
            <SectionTitle title="Parcelas dos próximos meses" />
            <LoanMonthsAhead from={addMonths(month, 1)} count={6} />
          </>
        ) : null}
      </ScrollView>

      {prepay ? (
        <PrepaySheet
          key={prepay.loan.id}
          visible
          summary={prepay}
          onClose={() => setPrepay(null)}
          onDone={() => { setPrepay(null); refresh(); }}
        />
      ) : null}
    </>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <T size={13} weight="semibold" color={colors.primary}>{label}</T>
      <Icon name="chevron-right" size={16} color={colors.primary} />
    </Pressable>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surface3 }]}>
      <Icon name={icon} size={16} color={colors.primary} />
      <T size={12.5} weight="semibold" color={colors.primary}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  cardChip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  limit: { paddingHorizontal: 14, gap: 5, marginTop: -4, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
});
