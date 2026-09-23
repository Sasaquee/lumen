import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Button, Chip, Field, Icon, Input, MoneyInput, MonthSwitcher, Segmented, Stepper, T, IconButton } from '../components/ui';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { invoiceDates, invoiceMonthFor } from '../data/engine';
import { METHOD_ICONS, METHOD_LABELS, type Kind, type Method } from '../data/types';
import { addMonths, formatDateLong, formatDate, fromISODate, monthLabel, monthShort, toISODate, today } from '../utils/dates';
import { formatMoney, installmentAmount } from '../utils/money';

type Mode = 'single' | 'installments' | 'recurring';
const METHODS: Method[] = ['pix', 'debito', 'cartao', 'dinheiro', 'boleto', 'vr'];
/** Para receita a pergunta é outra: onde o dinheiro cai. */
const INCOME_METHODS: Method[] = ['pix', 'vr'];
const INCOME_METHOD_LABELS: Partial<Record<Method, string>> = { pix: 'Na conta', vr: 'Vale refeição' };

export default function EntryFormScreen({ route, navigation }: RootProps<'EntryForm'>) {
  const insets = useSafeAreaInsets();
  const { ledger, refresh, month: viewMonth } = useStore();
  const p = route.params ?? {};
  const editingEntry = p.entryId ? ledger.snap.entries.find((e) => e.id === p.entryId) : undefined;
  const editingRec = p.recurringId ? ledger.snap.recurrings.find((r) => r.id === p.recurringId) : undefined;
  const isEdit = !!(editingEntry || editingRec);
  const base = editingEntry ?? editingRec;

  const [kind, setKind] = useState<Kind>(base?.kind ?? p.kind ?? 'expense');
  const [mode, setMode] = useState<Mode>(editingRec ? 'recurring' : editingEntry ? (editingEntry.installments > 1 ? 'installments' : 'single') : p.mode ?? 'single');
  const [amount, setAmount] = useState(base?.amount_cents ?? 0);
  const [amountIsTotal, setAmountIsTotal] = useState(true);
  // o campo mostra ora o total, ora a parcela. Ao dividir, guarda o total de origem para
  // a volta não perder os centavos que a divisão arredonda.
  const [splitFrom, setSplitFrom] = useState<number | null>(null);
  const [description, setDescription] = useState(base?.description ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(base?.category_id ?? null);
  const [method, setMethod] = useState<Method>(base?.method ?? p.method ?? 'pix');
  const [cardId, setCardId] = useState<number | null>(base?.card_id ?? p.cardId ?? null);
  const defaultDate = p.date ?? (viewMonth === ledger.currentCycle() ? today() : ledger.cycleStart(viewMonth));
  const [date, setDate] = useState(editingEntry?.date ?? defaultDate);
  const [installments, setInstallments] = useState(editingEntry && editingEntry.installments > 1 ? editingEntry.installments : 2);
  const [day, setDay] = useState(editingRec?.day ?? Number(today().slice(8)));
  const [startMonth, setStartMonth] = useState(editingRec?.start_month ?? viewMonth);
  const [hasEnd, setHasEnd] = useState(!!editingRec?.end_month);
  const [endMonth, setEndMonth] = useState(editingRec?.end_month ?? addMonths(viewMonth, 11));
  const [notes, setNotes] = useState(base?.notes ?? '');
  // detalhe de um total informado: a compra pertence àquela fatura, não à data
  const pinnedInvoice = p.invoiceMonth ?? editingEntry?.invoice_month ?? null;
  const [paidNow, setPaidNow] = useState(editingEntry ? ledger.isPaid(`e:${editingEntry.id}:0`) : true);

  const categories = ledger.snap.categories.filter((c) => c.kind === kind && (!c.archived || c.id === categoryId));
  const cards = ledger.snap.cards.filter((c) => !c.archived || c.id === cardId);
  const card = method === 'cartao' ? cards.find((c) => c.id === cardId) : undefined;
  const isExpense = kind === 'expense';
  const effMode: Mode = !isExpense && mode === 'installments' ? 'single' : mode;

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Editar lançamento' : 'Novo lançamento' });
  }, [navigation, isEdit]);

  // se a parcela ainda é a que saiu daquele total, o total volta inteiro em vez de amount × n
  const keptTotal =
    splitFrom != null && installmentAmount(splitFrom, installments, 1) === amount ? splitFrom : null;
  const total = effMode === 'installments' && !amountIsTotal ? keptTotal ?? amount * installments : amount;

  /** Troca a base do valor convertendo o que está no campo, em vez de só trocar o rótulo. */
  const toggleAmountBasis = () => {
    setAmount(amountIsTotal ? installmentAmount(amount, installments, 1) : total);
    setSplitFrom(amountIsTotal ? amount : null);
    setAmountIsTotal(!amountIsTotal);
  };

  const preview = useMemo(() => {
    if (!isExpense) return null;
    if (effMode === 'recurring') {
      if (card) return `Cobrado todo dia ${day} no ${card.name}, entra na fatura do mês seguinte ao fechamento.`;
      return null;
    }
    const parts: string[] = [];
    if (effMode === 'installments' && total > 0) {
      parts.push(`${installments}x de ${formatMoney(installmentAmount(total, installments, 1))} · total ${formatMoney(total)}`);
    }
    if (card) {
      const first = pinnedInvoice ?? invoiceMonthFor(card, date);
      const { dueDate } = invoiceDates(card, first);
      parts.push(`${effMode === 'installments' ? '1ª parcela na' : 'Entra na'} fatura de ${monthLabel(first)} (vence ${formatDate(dueDate)})`);
      if (pinnedInvoice) parts.push('A compra fica nesta fatura mesmo que você mude a data.');
      if (ledger.customCycle) parts.push(`Essa fatura conta no mês de ${monthLabel(ledger.invoiceCycle(card, first))}`);
      if (effMode === 'installments') parts.push(`Última parcela: ${monthLabel(addMonths(first, installments - 1))}`);
    } else if (effMode === 'installments') {
      const firstCycle = ledger.cycleOf(date);
      parts.push(`De ${monthShort(firstCycle, true)} até ${monthShort(addMonths(firstCycle, installments - 1), true)}`);
    }
    return parts.join('\n');
  }, [isExpense, effMode, card, day, total, installments, date, pinnedInvoice]);

  const pickDate = () => {
    DateTimePickerAndroid.open({
      value: fromISODate(date),
      mode: 'date',
      onChange: (e, d) => { if (e.type === 'set' && d) setDate(toISODate(d)); },
    });
  };

  const save = () => {
    if (amount <= 0) return Alert.alert('Informe o valor', 'O valor precisa ser maior que zero.');
    const cat = ledger.category(categoryId);
    const desc = description.trim() || cat?.name || '';
    if (!desc) return Alert.alert('Informe uma descrição', 'Ou escolha uma categoria.');
    const m: Method = isExpense ? method : (method === 'vr' ? 'vr' : 'pix');
    if (m === 'cartao' && !card) return Alert.alert('Escolha o cartão', 'Selecione um cartão ou cadastre um novo.');
    const common = {
      kind, description: desc, category_id: categoryId, method: m,
      card_id: m === 'cartao' ? cardId : null, notes: notes.trim() || null,
    };

    if (effMode === 'recurring') {
      if (hasEnd && endMonth < startMonth) return Alert.alert('Período inválido', 'O mês final deve ser depois do inicial.');
      const input: db.RecurringInput = { ...common, amount_cents: amount, day, start_month: startMonth, end_month: hasEnd ? endMonth : null };
      if (editingRec) {
        const from = p.editMonth ?? ledger.currentCycle();
        const valueChanged = editingRec.amount_cents !== amount || editingRec.day !== day || editingRec.method !== m || editingRec.card_id !== input.card_id;
        if (valueChanged && editingRec.start_month < from && startMonth === editingRec.start_month) {
          Alert.alert('Aplicar alteração', 'Os meses anteriores devem manter o valor antigo?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Todos os meses', onPress: () => { db.saveRecurring({ ...input, id: editingRec.id }); done(); } },
            { text: `A partir de ${monthShort(from, true)}`, onPress: () => { db.splitRecurring(editingRec.id, from, addMonths(from, -1), input); done(); } },
          ]);
          return;
        }
        db.saveRecurring({ ...input, id: editingRec.id });
      } else {
        db.saveRecurring(input);
      }
      return done();
    }

    const n = effMode === 'installments' ? installments : 1;
    const id = db.saveEntry({
      ...common,
      id: editingEntry?.id,
      amount_cents: total,
      date,
      installments: n,
      invoice_month: m === 'cartao' ? pinnedInvoice : null,
    });
    if (n === 1 && m !== 'cartao') db.setPaid(`e:${id}:0`, paidNow);
    done();
  };

  const done = () => { refresh(); navigation.goBack(); };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {!isEdit && (
          <Segmented
            value={kind}
            onChange={(k) => { setKind(k); setCategoryId(null); if (k === 'income' && method !== 'vr') setMethod('pix'); }}
            options={[{ value: 'expense', label: 'Despesa', color: colors.expense }, { value: 'income', label: 'Receita', color: colors.income }]}
          />
        )}

        <View style={styles.amountBox}>
          <T size={13} color={colors.muted} align="center">
            {effMode === 'installments' ? (amountIsTotal ? 'Valor total da compra' : 'Valor de cada parcela') : effMode === 'recurring' ? 'Valor mensal' : 'Valor'}
          </T>
          <MoneyInput value={amount} onChange={setAmount} big autoFocus={!isEdit} color={isExpense ? colors.text : colors.income} />
          {effMode === 'installments' && (
            <Pressable onPress={toggleAmountBasis} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="swap-horizontal" size={16} color={colors.primary} />
              <T size={13} color={colors.primary} weight="medium">{amountIsTotal ? 'Informar valor da parcela' : 'Informar valor total'}</T>
            </Pressable>
          )}
        </View>

        {!(isEdit) || (editingEntry) ? (
          <Segmented
            value={effMode}
            onChange={setMode}
            options={[
              { value: 'single', label: isExpense ? 'Avulso' : 'Avulsa' },
              ...(isExpense ? [{ value: 'installments' as Mode, label: 'Parcelado' }] : []),
              ...(!isEdit ? [{ value: 'recurring' as Mode, label: isExpense ? 'Fixo mensal' : 'Fixa mensal' }] : []),
            ]}
          />
        ) : null}

        <Field label="Descrição">
          <Input value={description} onChangeText={setDescription} placeholder={isExpense ? 'Ex.: Aluguel, Netflix, Mercado' : 'Ex.: Salário, Freela'} />
        </Field>

        <Field label="Categoria">
          <View style={styles.wrap}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} active={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
            ))}
            <Chip label="Nova" icon="plus" onPress={() => navigation.navigate('CategoryForm', { kind })} />
          </View>
        </Field>

        {isExpense ? (
          <Field label="Forma de pagamento">
            <View style={styles.wrap}>
              {METHODS.map((mm) => (
                <Chip key={mm} label={METHOD_LABELS[mm]} icon={METHOD_ICONS[mm]} active={method === mm} onPress={() => {
                  setMethod(mm);
                  if (mm === 'cartao' && cardId == null && cards.length > 0) setCardId(cards.find((c) => !c.archived)?.id ?? null);
                }} />
              ))}
            </View>
          </Field>
        ) : (
          <Field
            label="Onde cai"
            hint={method === 'vr' ? 'O vale refeição é uma carteira à parte: não entra no caixa e só é gasto pagando com ele.' : undefined}
          >
            <View style={styles.wrap}>
              {INCOME_METHODS.map((mm) => (
                <Chip
                  key={mm}
                  label={INCOME_METHOD_LABELS[mm] ?? METHOD_LABELS[mm]}
                  icon={mm === 'pix' ? 'bank-outline' : METHOD_ICONS[mm]}
                  active={(method === 'vr' ? 'vr' : 'pix') === mm}
                  onPress={() => setMethod(mm)}
                />
              ))}
            </View>
          </Field>
        )}

        {isExpense && method === 'cartao' && (
          <Field label="Cartão">
            <View style={styles.wrap}>
              {cards.map((c) => (
                <Chip key={c.id} label={c.name} icon="credit-card-outline" color={c.color} active={cardId === c.id} onPress={() => setCardId(c.id)} />
              ))}
              <Chip label={cards.length ? 'Novo cartão' : 'Cadastrar cartão'} icon="plus" onPress={() => navigation.navigate('CardForm', {})} />
            </View>
          </Field>
        )}

        {effMode === 'recurring' ? (
          <>
            <Field label="Dia do mês" hint={isExpense ? 'Dia em que a conta vence ou é cobrada.' : 'Dia em que você recebe.'}>
              <Stepper value={day} onChange={setDay} min={1} max={31} format={(v) => `Dia ${v}`} />
            </Field>
            <Field label="Começa em">
              <MonthSwitcher month={startMonth} onChange={setStartMonth} />
            </Field>
            <Field label="Termina">
              <View style={styles.switchRow}>
                <T style={{ flex: 1 }} color={colors.textSecondary}>{hasEnd ? 'Tem data para acabar' : 'Sem data final'}</T>
                <Switch value={hasEnd} onValueChange={setHasEnd} trackColor={{ true: colors.primaryDark, false: colors.surface3 }} thumbColor={hasEnd ? colors.primary : colors.muted} />
              </View>
              {hasEnd && <MonthSwitcher month={endMonth} onChange={setEndMonth} />}
            </Field>
          </>
        ) : (
          <>
            {effMode === 'installments' && (
              <Field label="Número de parcelas">
                <Stepper value={installments} onChange={setInstallments} min={2} max={72} format={(v) => `${v}x`} />
              </Field>
            )}
            <Field label={card ? 'Data da compra' : effMode === 'installments' ? 'Data da 1ª parcela' : 'Data'}>
              <Pressable onPress={pickDate} style={styles.dateBtn}>
                <Icon name="calendar-month-outline" size={20} color={colors.textSecondary} />
                <T style={{ flex: 1 }}>{formatDateLong(date)}</T>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <IconButton icon="chevron-left" size={32} onPress={() => setDate(toISODate(new Date(fromISODate(date).getTime() - 86400000)))} />
                  <IconButton icon="chevron-right" size={32} onPress={() => setDate(toISODate(new Date(fromISODate(date).getTime() + 86400000)))} />
                </View>
              </Pressable>
            </Field>
            {effMode === 'single' && method !== 'cartao' || (effMode === 'single' && !isExpense) ? (
              <View style={styles.switchRow}>
                <Icon name="check-circle-outline" size={20} color={paidNow ? colors.primary : colors.muted} />
                <T style={{ flex: 1 }}>{isExpense ? 'Já está pago' : 'Já recebi'}</T>
                <Switch value={paidNow} onValueChange={setPaidNow} trackColor={{ true: colors.primaryDark, false: colors.surface3 }} thumbColor={paidNow ? colors.primary : colors.muted} />
              </View>
            ) : null}
          </>
        )}

        {preview ? (
          <View style={styles.preview}>
            <Icon name="information-outline" size={18} color={colors.primary} />
            <T size={13.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{preview}</T>
          </View>
        ) : null}

        <Field label="Observação (opcional)">
          <Input value={notes} onChangeText={setNotes} placeholder="Anotações" multiline style={{ height: 80, paddingTop: 12, textAlignVertical: 'top' }} />
        </Field>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={isEdit ? 'Salvar alterações' : 'Adicionar'} icon="check" onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  amountBox: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, height: 54, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingLeft: 14, paddingRight: 8, height: 54, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  preview: { flexDirection: 'row', gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
