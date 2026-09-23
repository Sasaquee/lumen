import React, { useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import {
  Button, Card, CategoryIcon, Divider, EmptyState, Icon, Input, MoneyInput, MonthSwitcher,
  ProgressBar, SectionTitle, Sheet, T,
} from '../components/ui';
import { ItemRow } from '../components/ItemRow';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { dateInInvoice, invoiceDates, isPendingCharge, UNDETAILED_CATEGORY } from '../data/engine';
import { currentMonth, formatDate, monthLabel } from '../utils/dates';
import { formatMoney } from '../utils/money';

const UNDETAILED_COLOR = UNDETAILED_CATEGORY.color;

export default function InvoiceScreen({ route, navigation }: RootProps<'Invoice'>) {
  const { ledger, refresh } = useStore();
  const [month, setMonth] = useState(route.params.month);
  const [editor, setEditor] = useState(false);
  const [help, setHelp] = useState(false);
  const [draft, setDraft] = useState(0);
  const [draftNotes, setDraftNotes] = useState('');
  const card = ledger.card(route.params.cardId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: card ? `Fatura · ${card.name}` : 'Fatura' });
  }, [navigation, card]);

  if (!card) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const inv = ledger.invoice(card.id, month);
  const { dueDate, closingDate } = invoiceDates(card, month);
  const total = inv?.total ?? 0;
  const declared = inv?.declaredTotal ?? null;
  const itemsTotal = inv?.itemsTotal ?? 0;
  const undetailed = inv?.undetailed ?? 0;
  const items = inv?.items ?? [];
  const pending = inv?.pending ?? 0;
  const charged = inv?.charged ?? 0;
  const pendingItems = items.filter((it) => isPendingCharge(it));
  const committed = ledger.cardCommitted(card.id, currentMonth());
  const available = card.limit_cents ? card.limit_cents - committed : null;
  const payCycle = ledger.invoiceCycle(card, month);

  const openEditor = () => {
    setDraft(declared ?? itemsTotal);
    setDraftNotes(inv?.notes ?? '');
    setEditor(true);
  };

  const saveTotal = () => {
    db.setInvoiceTotal(card.id, month, draft, draftNotes.trim() || null);
    refresh();
    setEditor(false);
  };

  const clearTotal = () => {
    db.clearInvoiceTotal(card.id, month);
    refresh();
    setEditor(false);
  };

  const addDetail = () =>
    navigation.navigate('EntryForm', { method: 'cartao', cardId: card.id, date: dateInInvoice(card, month), invoiceMonth: month });

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <MonthSwitcher
          month={payCycle}
          onChange={(c) => setMonth(ledger.invoiceMonthOfCycle(card, c))}
          hint={ledger.customCycle ? ledger.cycleRange(payCycle) : undefined}
        />

        <Card style={{ marginTop: 12, padding: 20, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} color={colors.muted}>Fecha {formatDate(closingDate)}</T>
            <T size={13} color={colors.muted}>Vence {formatDate(dueDate)}</T>
          </View>
          <T size={34} weight="extrabold" style={{ letterSpacing: -1, marginTop: 6 }} adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(total)}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={13} color={inv?.paid ? colors.primary : colors.warning}>
              {total === 0 && declared == null ? 'Sem lançamentos' : inv?.paid ? 'Fatura paga' : 'Em aberto'}
            </T>
            {declared != null ? <T size={13} color={colors.textSecondary}>· total informado</T> : null}
          </View>
          {ledger.customCycle && payCycle !== month ? (
            <T size={12.5} color={colors.muted}>Fatura de {monthLabel(month)} no cartão</T>
          ) : null}

          {pending > 0 ? (
            <View style={styles.projection}>
              <View style={{ flex: 1, gap: 1 }}>
                <T size={11.5} color={colors.muted}>Já cobrado</T>
                <T size={15} weight="semibold">{formatMoney(charged)}</T>
              </View>
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.surface3 }} />
              <View style={{ flex: 1, gap: 1 }}>
                <Pressable
                  onPress={() => setHelp(true)}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <T size={11.5} color={colors.muted}>Projeção</T>
                  <Icon name="help-circle-outline" size={14} color={colors.primary} />
                </Pressable>
                <T size={15} weight="semibold" color={colors.primary}>{formatMoney(total)}</T>
              </View>
            </View>
          ) : null}

          {declared != null ? (
            <View style={{ marginTop: 16, gap: 10 }}>
              <Breakdown
                color={card.color}
                label="Detalhado"
                hint={`${items.length} ${items.length === 1 ? 'lançamento' : 'lançamentos'}`}
                value={itemsTotal}
              />
              <Breakdown
                color={UNDETAILED_COLOR}
                label="Não detalhado"
                hint="gastos que você não lançou item por item"
                value={undetailed}
              />
              {inv?.overDetailed ? (
                <View style={styles.warn}>
                  <Icon name="alert-outline" size={18} color={colors.warning} />
                  <T size={12.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
                    Os detalhes somam {formatMoney(itemsTotal)}, mais que o total informado ({formatMoney(declared)}). Estou considerando {formatMoney(total)} no mês.
                  </T>
                </View>
              ) : null}
              {inv?.notes ? (
                <View style={styles.note}>
                  <Icon name="text-box-outline" size={18} color={colors.muted} />
                  <T size={13} color={colors.textSecondary} style={{ flex: 1, lineHeight: 19 }}>{inv.notes}</T>
                </View>
              ) : null}
            </View>
          ) : null}

          {card.limit_cents && available != null ? (
            <View style={{ marginTop: 14, gap: 8 }}>
              <ProgressBar value={committed / card.limit_cents} color={committed > card.limit_cents ? colors.danger : card.color} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <T size={11.5} color={colors.muted}>Limite usado</T>
                  <T size={14.5} weight="semibold">{formatMoney(committed)}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T size={11.5} color={colors.muted}>Limite restante</T>
                  <T size={14.5} weight="semibold" color={available >= 0 ? colors.primary : colors.danger}>
                    {formatMoney(available)}
                  </T>
                </View>
              </View>
              <T size={11.5} color={colors.muted} style={{ lineHeight: 16 }}>
                Limite total {formatMoney(card.limit_cents)} — soma das faturas em aberto deste mês em diante.
                Fixo mensal dos próximos meses só entra no limite quando o mês chega.
              </T>
            </View>
          ) : null}

          <Button
            style={{ marginTop: 16 }}
            variant={declared == null ? 'secondary' : 'ghost'}
            icon={declared == null ? 'cash-edit' : 'pencil-outline'}
            title={declared == null ? 'Informar total da fatura' : 'Editar total informado'}
            onPress={openEditor}
          />
          {inv && total > 0 ? (
            <Button
              variant={inv.paid ? 'secondary' : 'primary'}
              icon={inv.paid ? 'undo' : 'check'}
              title={inv.paid ? 'Marcar como não paga' : 'Marcar fatura como paga'}
              onPress={() => { db.setPaid(inv.key, !inv.paid); refresh(); }}
            />
          ) : null}
        </Card>

        {declared == null ? (
          <View style={styles.hint}>
            <Icon name="information-outline" size={18} color={colors.primary} />
            <T size={13} color={colors.textSecondary} style={{ flex: 1, lineHeight: 19 }}>
              Não lembra tudo que gastou? Informe só o total da fatura e depois detalhe o que lembrar — o resto fica como não detalhado.
            </T>
          </View>
        ) : null}

        <SectionTitle
          title="Lançamentos"
          right={<T size={13} color={colors.textSecondary}>{formatMoney(itemsTotal)}</T>}
        />
        <Card padded={false} style={{ paddingVertical: 4 }}>
          {items.length ? items.map((it, idx) => (
            <View key={it.key}>
              {idx > 0 && <Divider />}
              <ItemRow item={it} month={month} showCheck={false} />
            </View>
          )) : (
            <EmptyState
              icon="credit-card-off-outline"
              title={declared != null ? 'Nenhum detalhe ainda' : 'Nada nesta fatura'}
              text={declared != null ? 'Adicione o que você lembra: assinaturas, uma compra grande, o mercado...' : undefined}
            />
          )}
          {undetailed > 0 ? (
            <>
              {items.length > 0 ? <Divider /> : null}
              <Pressable onPress={openEditor} style={styles.undetailedRow}>
                <CategoryIcon icon="help-circle-outline" color={colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={15} weight="medium">Outros gastos</T>
                  <T size={12.5} color={colors.muted}>Parte não detalhada do total</T>
                </View>
                <T size={15} weight="semibold" color={colors.textSecondary}>{formatMoney(undetailed)}</T>
              </Pressable>
            </>
          ) : null}
        </Card>

        <Button
          style={{ marginTop: 12 }}
          variant="secondary"
          icon="plus"
          title={declared != null ? 'Detalhar um gasto desta fatura' : 'Adicionar compra neste cartão'}
          onPress={addDetail}
        />
      </ScrollView>

      <Sheet visible={help} onClose={() => setHelp(false)} title="Já cobrado e projeção">
        <View style={{ paddingHorizontal: 8, gap: 14, paddingBottom: 4 }}>
          <T size={13.5} color={colors.textSecondary} style={{ lineHeight: 20 }}>
            O banco só lança um fixo mensal no dia da cobrança. Até lá ele não aparece na fatura do
            app do banco — mas o Lumen já sabe que ele vem.
          </T>
          <View style={{ gap: 10 }}>
            <Breakdown
              color={colors.textSecondary}
              label="Já cobrado"
              hint="o valor que o app do banco mostra hoje"
              value={charged}
            />
            <Breakdown
              color={colors.primary}
              label="Projeção"
              hint="o que a fatura vira se você mantiver as assinaturas"
              value={total}
            />
          </View>
          <View style={{ gap: 8 }}>
            <T size={12.5} weight="medium" color={colors.muted}>AINDA NÃO COBRADO</T>
            {pendingItems.map((it) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T size={13.5} style={{ flex: 1 }}>{it.description}</T>
                <T size={12.5} color={colors.muted}>cobra {formatDate(it.date)}</T>
                <T size={13.5} weight="semibold">{formatMoney(it.amount)}</T>
              </View>
            ))}
          </View>
          <T size={12.5} color={colors.muted} style={{ lineHeight: 18 }}>
            Se você cancelar uma assinatura antes da data da cobrança, ela não entra e a fatura fica
            no valor já cobrado. O resto do app usa a projeção, para o mês não vir com surpresa.
          </T>
          <Button title="Entendi" icon="check" onPress={() => setHelp(false)} />
        </View>
      </Sheet>

      <Sheet visible={editor} onClose={() => setEditor(false)} title={`Total da fatura · ${monthLabel(payCycle)}`}>
        <View style={{ paddingHorizontal: 8, gap: 14, paddingBottom: 4 }}>
          <T size={13} color={colors.textSecondary} style={{ lineHeight: 19 }}>
            Valor cheio que veio na fatura do {card.name}. Os lançamentos que você detalhar entram dentro desse total, sem somar por cima.
          </T>
          <MoneyInput value={draft} onChange={setDraft} autoFocus big />
          <Input
            value={draftNotes}
            onChangeText={setDraftNotes}
            placeholder="Observação (ex.: uns deliveries e a farmácia)"
            multiline
            style={{ height: 76, paddingTop: 12, textAlignVertical: 'top' }}
          />
          <Button title="Salvar total da fatura" icon="check" disabled={draft <= 0} onPress={saveTotal} />
          {declared != null ? (
            <>
              <Button title="Remover total informado" icon="close" variant="danger" onPress={clearTotal} />
              <T size={12.5} color={colors.muted} align="center">
                Sem total informado, a fatura volta a ser a soma dos lançamentos.
              </T>
            </>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

function Breakdown({ color, label, hint, value }: { color: string; label: string; hint: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <T size={14} weight="medium">{label}</T>
        <T size={12} color={colors.muted}>{hint}</T>
      </View>
      <T size={14.5} weight="semibold">{formatMoney(value)}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  warn: { flexDirection: 'row', gap: 8, backgroundColor: colors.warningSoft, borderRadius: 12, padding: 10, marginTop: 2 },
  note: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginTop: 2 },
  hint: { flexDirection: 'row', gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginTop: 12 },
  undetailedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  projection: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14,
    backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
});
