import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Button, Card, Checkbox, Divider, EmptyState, Icon, MonthSwitcher, ProgressBar, SectionTitle, T } from '../components/ui';
import { LoanMonthsAhead, PrepaySheet } from './LoansScreens';
import { ItemRow } from '../components/ItemRow';
import { useStore } from '../data/store';
import * as db from '../data/db';
import type { Item, LoanSummary } from '../data/engine';
import { VR } from '../data/types';
import { addMonths, currentMonth, formatDate, monthShort, today } from '../utils/dates';
import { formatMoney } from '../utils/money';

/** Quanto falta e quanto já foi pago num grupo de contas. */
interface Tally { total: number; paid: number; left: number }
const tally = (list: { amount: number; paid: boolean }[]): Tally => {
  const total = list.reduce((s, x) => s + x.amount, 0);
  const paid = list.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0);
  return { total, paid, left: total - paid };
};

/**
 * Tudo que sai do bolso no mês selecionado: faturas, parcelas de contratos e contas
 * fixas, com o botão de pagar ali mesmo. Os números de cima mostram o que FALTA pagar —
 * o que foi marcado como pago sai da conta, e o total já pago aparece à parte. O mês
 * segue o ciclo do usuário, como as outras abas.
 */
export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { ledger, month, setMonth, refresh } = useStore();
  const [prepay, setPrepay] = useState<LoanSummary | null>(null);

  const data = ledger.month(month);
  const cards = ledger.snap.cards.filter((c) => !c.archived);
  const loanItems = ledger.loanItems(month).filter((i) => i.kind === 'expense');
  // fixos fora do cartão (os do cartão já estão na fatura); vale se paga sozinho e fica de fora
  const fixed: Item[] = data.expenses.filter((i) => i.source === 'recurring' && i.method !== VR);
  const inv = tally(data.invoices.filter((i) => i.total > 0).map((i) => ({ amount: i.total, paid: i.paid })));
  const lo = tally(loanItems);
  const fx = tally(fixed);
  const all = tally([
    { amount: inv.paid, paid: true }, { amount: inv.left, paid: false },
    { amount: lo.paid, paid: true }, { amount: lo.left, paid: false },
    { amount: fx.paid, paid: true }, { amount: fx.left, paid: false },
  ]);
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

        <Card style={{ marginTop: 12, padding: 18, gap: 4 }}>
          <T size={13} color={colors.textSecondary}>Falta pagar em {short}</T>
          <T size={32} weight="extrabold" color={all.left > 0 ? colors.warning : colors.primary} style={{ letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(all.left)}
          </T>
          <View style={{ marginTop: 8, gap: 6 }}>
            <ProgressBar value={all.total ? all.paid / all.total : 0} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={12.5} color={colors.primary}>Já pago: {formatMoney(all.paid)}</T>
              <T size={12.5} color={colors.muted}>Total do mês: {formatMoney(all.total)}</T>
            </View>
          </View>
          {all.total > 0 && all.left === 0 ? (
            <View style={styles.allPaid}>
              <Icon name="check-circle" size={16} color={colors.primary} />
              <T size={12.5} color={colors.textSecondary}>Tudo de {short} está pago.</T>
            </View>
          ) : null}
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Kpi icon="credit-card-outline" label="Faturas" t={inv} />
          <Kpi icon="bank-outline" label="Empréstimos" t={lo} />
          <Kpi icon="repeat" label="Fixos" t={fx} />
        </View>
        <T size={11.5} color={colors.muted} style={{ marginTop: 6, paddingHorizontal: 4 }}>
          Mostra o que falta pagar em {short}{ledger.customCycle ? ` (${ledger.cycleRange(month)})` : ''}. Marcou como pago, sai da conta.
        </T>

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

        {/* ---------------- contas fixas e assinaturas */}
        <SectionTitle
          title="Contas fixas e assinaturas"
          right={<T size={13} color={colors.textSecondary}>{fx.left > 0 ? `falta ${formatMoney(fx.left)}` : fx.total ? 'tudo pago' : ''}</T>}
        />
        {fixed.length ? (
          <Card padded={false} style={{ paddingVertical: 4 }}>
            {fixed.map((it, i) => (
              <View key={it.key}>
                {i > 0 && <Divider />}
                <ItemRow item={it} month={month} />
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="repeat"
              title="Nenhuma conta fixa"
              text="Aluguel, internet, assinaturas: cadastre como fixo mensal e ele aparece aqui todo mês. Assinatura no cartão fica dentro da fatura."
              action={<Button title="Adicionar conta fixa" icon="plus" onPress={() => nav.navigate('EntryForm', { kind: 'expense', mode: 'recurring' })} />}
            />
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

function Kpi({ icon, label, t }: { icon: string; label: string; t: Tally }) {
  const done = t.total > 0 && t.left === 0;
  return (
    <Card style={{ flex: 1, padding: 12, gap: 4 }}>
      <View style={styles.statLabel}>
        <Icon name={done ? 'check-circle' : icon} size={15} color={done ? colors.primary : colors.textSecondary} />
        <T size={12} color={colors.muted}>{label}</T>
      </View>
      <T size={15} weight="bold" color={done ? colors.primary : colors.text} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(t.left)}</T>
      <T size={11} color={colors.muted} numberOfLines={1}>{done ? 'pago' : t.total ? `de ${formatMoney(t.total)}` : 'nada no mês'}</T>
    </Card>
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
  allPaid: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: colors.primarySoft, borderRadius: 10, padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  cardChip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  limit: { paddingHorizontal: 14, gap: 5, marginTop: -4, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
});
