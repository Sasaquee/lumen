import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { Checkbox, Icon, ListRow, Sheet, SheetAction, T, MoneyInput, Button } from './ui';
import type { Invoice, Item } from '../data/engine';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { addMonths, formatDate, monthLabel, monthOf } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { METHOD_LABELS } from '../data/types';

export function itemSubtitle(item: Item, categoryName?: string, walletName?: string) {
  const parts: string[] = [];
  if (categoryName) parts.push(categoryName);
  parts.push(formatDate(item.date));
  if (item.installment) parts.push(`${item.installment.index}/${item.installment.total}`);
  if (item.source === 'recurring') parts.push('Fixo');
  const showMethod = item.cardId == null && item.method !== 'pix' && (item.kind === 'expense' || item.method === 'vr');
  // num vale, o nome da carteira diz mais que a palavra 'Vale'
  if (showMethod) parts.push(item.method === 'vr' ? (walletName ?? METHOD_LABELS.vr) : METHOD_LABELS[item.method]);
  return parts.join(' · ');
}

/** Subtítulo da linha de fatura: vencimento e se o total foi informado à mão. */
function invoiceSubtitle(inv?: Invoice) {
  if (!inv) return '';
  const detail = inv.declaredTotal != null
    ? 'total informado'
    : `${inv.items.length} ${inv.items.length === 1 ? 'lançamento' : 'lançamentos'}`;
  return `Vence ${formatDate(inv.dueDate)} · ${detail}`;
}

/** Linha de lançamento com checkbox de pago e menu de ações. */
export function ItemRow({ item, month, showCheck = true }: { item: Item; month: string; showCheck?: boolean }) {
  const { ledger, refresh } = useStore();
  const nav = useNavigation();
  const [menu, setMenu] = useState(false);
  const [editAmount, setEditAmount] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const cat = ledger.category(item.categoryId);
  const isIncome = item.kind === 'income';
  const inCard = item.cardId != null;
  // itens sinteticos: a parte nao detalhada e a fatura inteira. Nao dao para editar aqui.
  const synthetic = item.source === 'undetailed';
  const isInvoice = item.source === 'invoice';
  const invoice = isInvoice && item.cardId != null && item.invoiceMonth
    ? ledger.invoice(item.cardId, item.invoiceMonth)
    : undefined;

  const openInvoice = () => {
    nav.navigate('Invoice', { cardId: item.cardId!, month: item.invoiceMonth ?? month });
  };

  const togglePaid = () => { db.setPaid(item.key, !item.paid); refresh(); };

  const chargeMonth = item.chargeMonth ?? monthOf(item.date);

  const edit = () => {
    setMenu(false);
    if (item.recurringId) nav.navigate('EntryForm', { recurringId: item.recurringId, editMonth: chargeMonth });
    else if (item.entryId) nav.navigate('EntryForm', { entryId: item.entryId });
  };

  const closeMenu = () => { setMenu(false); setEditAmount(null); setRemoving(false); };

  const removeRecurring = (mode: 'month' | 'end' | 'all') => {
    const id = item.recurringId!;
    closeMenu();
    if (mode === 'month') { db.setOverride(id, chargeMonth, null, true); refresh(); return; }
    if (mode === 'end') { db.endRecurring(id, addMonths(chargeMonth, -1)); refresh(); return; }
    Alert.alert('Apagar recorrente', `"${item.description}" será removido de todos os meses, inclusive do histórico.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => { db.deleteRecurring(id); refresh(); } },
    ]);
  };

  const remove = () => {
    if (item.recurringId) { setRemoving(true); return; }
    setMenu(false);
    if (item.entryId) {
      const id = item.entryId;
      Alert.alert('Excluir lançamento', item.installment ? `Isso apaga todas as ${item.installment.total} parcelas de "${item.description}".` : `Excluir "${item.description}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => { db.deleteEntry(id); refresh(); } },
      ]);
    }
  };

  return (
    <>
      <ListRow
        icon={isInvoice ? 'credit-card-outline' : cat?.icon}
        iconColor={isInvoice ? invoice?.card.color : cat?.color}
        title={item.description}
        subtitle={isInvoice ? invoiceSubtitle(invoice) : itemSubtitle(item, cat?.name, ledger.wallet(item.walletId)?.name)}
        onPress={() => (isInvoice ? openInvoice() : setMenu(true))}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <T size={15} weight="semibold" color={isIncome ? colors.income : colors.text}>
                {isIncome ? '+ ' : ''}{formatMoney(item.amount)}
              </T>
              {item.overridden ? <T size={11} color={colors.warning}>ajustado</T> : null}
            </View>
            {showCheck && (!inCard || isInvoice) ? <Checkbox checked={item.paid} onPress={togglePaid} /> : null}
          </View>
        }
      />
      <Sheet visible={menu} onClose={closeMenu} title={item.description}>
        {removing ? (
          <>
            <SheetAction icon="calendar-remove-outline" label={`Pular só ${monthLabel(chargeMonth)}`} onPress={() => removeRecurring('month')} />
            <SheetAction icon="calendar-end" label={`Encerrar a partir de ${monthLabel(chargeMonth)}`} onPress={() => removeRecurring('end')} />
            <SheetAction icon="trash-can-outline" label="Apagar de todos os meses" color={colors.danger} onPress={() => removeRecurring('all')} />
          </>
        ) : editAmount !== null ? (
          <View style={{ paddingHorizontal: 8, gap: 14 }}>
            <T color={colors.textSecondary}>Valor apenas em {monthLabel(chargeMonth)}</T>
            <MoneyInput value={editAmount} onChange={setEditAmount} autoFocus big />
            <Button title="Salvar valor do mês" onPress={() => {
              db.setOverride(item.recurringId!, chargeMonth, editAmount, false); refresh(); setEditAmount(null); setMenu(false);
            }} />
            {item.overridden ? <Button variant="ghost" title="Voltar ao valor padrão" onPress={() => {
              db.clearOverride(item.recurringId!, chargeMonth); refresh(); setEditAmount(null); setMenu(false);
            }} /> : null}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 6 }}>
              <Icon name={item.paid ? 'check-circle' : 'clock-outline'} size={16} color={item.paid ? colors.primary : colors.warning} />
              <T size={13.5} color={colors.textSecondary}>
                {formatMoney(item.amount)} · {item.paid ? (isIncome ? 'Recebido' : 'Pago') : (isIncome ? 'A receber' : 'Pendente')}
                {inCard ? ` · fatura ${ledger.card(item.cardId)?.name}` : ''}
              </T>
            </View>
            {!inCard && !synthetic && (
              <SheetAction
                icon={item.paid ? 'close-circle-outline' : 'check-circle-outline'}
                label={item.paid ? (isIncome ? 'Marcar como não recebido' : 'Marcar como pendente') : (isIncome ? 'Marcar como recebido' : 'Marcar como pago')}
                onPress={() => { togglePaid(); setMenu(false); }}
              />
            )}
            {inCard && (showCheck || synthetic) && (
              <SheetAction icon="credit-card-outline" label="Ver fatura" onPress={() => { setMenu(false); nav.navigate('Invoice', { cardId: item.cardId!, month: item.invoiceMonth ?? month }); }} />
            )}
            {synthetic ? (
              <T size={12.5} color={colors.muted} style={{ paddingHorizontal: 12, paddingVertical: 8, lineHeight: 18 }}>
                É a parte do total informado que ainda não foi detalhada. Para mudar, ajuste o total da fatura
                ou lance os gastos que você lembra.
              </T>
            ) : (
              <>
                {item.recurringId ? (
                  <SheetAction icon="pencil-box-outline" label="Alterar valor só deste mês" onPress={() => setEditAmount(item.amount)} />
                ) : null}
                <SheetAction icon="pencil-outline" label={item.recurringId ? 'Editar recorrente' : 'Editar lançamento'} onPress={edit} />
                <SheetAction icon="trash-can-outline" label="Excluir" color={colors.danger} onPress={remove} />
              </>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
