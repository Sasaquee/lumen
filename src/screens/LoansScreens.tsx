import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import {
  Button, Card, Checkbox, Chip, Divider, EmptyState, Field, Icon, Input, ListRow, MoneyInput, ProgressBar,
  SectionTitle, Segmented, Sheet, T, FormScroll } from '../components/ui';
import { ParcelEditor } from '../components/ParcelEditor';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { loanAmounts, loanParcelDate, loanRate, prepayValue, type Item, type LoanParcel, type LoanSummary } from '../data/engine';
import { METHOD_ICONS, METHOD_LABELS, type LoanType, type Method } from '../data/types';
import { addMonths, dateInMonth, dayOf, formatDate, formatDateLong, fromISODate, monthLabel, monthOf, monthShort, toISODate, today } from '../utils/dates';
import { formatMoney, formatRate } from '../utils/money';

const TYPE_LABEL: Record<LoanType, string> = { emprestimo: 'Empréstimo', financiamento: 'Financiamento' };
const LOAN_METHODS: Method[] = ['boleto', 'debito', 'pix'];

function pickDate(value: string, onChange: (d: string) => void) {
  DateTimePickerAndroid.open({
    value: fromISODate(value),
    mode: 'date',
    onChange: (e, d) => { if (e.type === 'set' && d) onChange(toISODate(d)); },
  });
}

function DateButton({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  return (
    <Pressable onPress={() => pickDate(value, onChange)} style={styles.dateBtn}>
      <Icon name="calendar-month-outline" size={20} color={colors.textSecondary} />
      <T style={{ flex: 1 }}>{formatDateLong(value)}</T>
      <Icon name="chevron-down" size={20} color={colors.muted} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- lista

export function LoansScreen({ navigation }: RootProps<'Loans'>) {
  const { ledger } = useStore();
  const summaries = ledger.snap.loans.map((l) => ledger.loanSummary(l));
  const running = summaries.filter((s) => !s.finished);
  const finished = summaries.filter((s) => s.finished);
  const owed = running.reduce((s, x) => s + x.remaining, 0);
  const thisCycle = ledger.currentCycle();
  const monthly = loanCycleTotal(ledger.loanItems(thisCycle));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {summaries.length ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card style={{ flex: 1, gap: 4 }}>
            <T size={12.5} color={colors.muted}>Saldo devedor</T>
            <T size={18} weight="bold" color={colors.warning} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(owed)}</T>
          </Card>
          <Card style={{ flex: 1, gap: 4 }}>
            <T size={12.5} color={colors.muted}>Parcelas em {monthShort(thisCycle)}</T>
            <T size={18} weight="bold" color={colors.expense} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(monthly)}</T>
            {ledger.customCycle ? <T size={11} color={colors.muted}>{ledger.cycleRange(thisCycle)}</T> : null}
          </Card>
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="bank-outline"
            title="Nenhum contrato"
            text="Cadastre empréstimos e financiamentos com todas as parcelas. Dá para antecipar parcelas e ver quanto economizou."
          />
        </Card>
      )}

      {running.length ? <SectionTitle title="Em andamento" /> : null}
      {running.map((s) => <LoanCard key={s.loan.id} s={s} onPress={() => navigation.navigate('LoanDetail', { id: s.loan.id })} />)}

      {running.length ? (
        <>
          <SectionTitle title="Próximos meses" right={<T size={12.5} color={colors.muted}>toque para ver as parcelas</T>} />
          <LoanMonthsAhead from={thisCycle} count={12} />
        </>
      ) : null}

      {finished.length ? <SectionTitle title="Quitados" /> : null}
      {finished.map((s) => <LoanCard key={s.loan.id} s={s} onPress={() => navigation.navigate('LoanDetail', { id: s.loan.id })} />)}

      <Button style={{ marginTop: 16 }} title="Novo contrato" icon="plus" variant={summaries.length ? 'secondary' : 'primary'} onPress={() => navigation.navigate('LoanForm', {})} />
    </ScrollView>
  );
}

/** O que os contratos cobram no ciclo: parcelas e antecipações pagas nele. */
export function loanCycleTotal(items: Item[]) {
  return items.filter((i) => i.kind === 'expense').reduce((s, i) => s + i.amount, 0);
}

/**
 * Parcelas dos contratos mês a mês (pelo ciclo do usuário). Tocar num mês abre as
 * parcelas dele, com o botão de marcar como paga.
 */
export function LoanMonthsAhead({ from, count = 6 }: { from: string; count?: number }) {
  const { ledger, refresh } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => Array.from({ length: count }, (_, i) => {
    const cycle = addMonths(from, i);
    const items = ledger.loanItems(cycle).filter((it) => it.kind === 'expense');
    return { cycle, items, total: loanCycleTotal(items), paid: items.filter((it) => it.paid).reduce((s, it) => s + it.amount, 0) };
  }).filter((r) => r.items.length), [ledger, from, count]);

  if (!rows.length) {
    return <Card><T size={13} color={colors.muted} align="center">Nenhuma parcela nos próximos meses.</T></Card>;
  }
  return (
    <Card padded={false} style={{ paddingVertical: 4 }}>
      {rows.map((r, i) => {
        const expanded = open === r.cycle;
        const done = r.paid >= r.total;
        return (
          <View key={r.cycle}>
            {i > 0 && <Divider />}
            <Pressable onPress={() => setOpen(expanded ? null : r.cycle)} style={({ pressed }) => [styles.monthRow, pressed && { backgroundColor: colors.surface2 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={14.5} weight="medium">{monthLabel(r.cycle)}</T>
                <T size={12} color={colors.muted} numberOfLines={1}>
                  {r.items.length} {r.items.length === 1 ? 'parcela' : 'parcelas'}
                  {ledger.customCycle ? ` · ${ledger.cycleRange(r.cycle)}` : ''}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T size={15} weight="semibold">{formatMoney(r.total)}</T>
                {r.paid > 0 ? <T size={11.5} color={colors.primary}>{done ? 'tudo pago' : `${formatMoney(r.paid)} pago`}</T> : null}
              </View>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
            </Pressable>
            {expanded ? r.items.map((it) => (
              <View key={it.key} style={styles.monthItem}>
                <View style={{ flex: 1 }}>
                  <T size={13.5} numberOfLines={1}>{it.description}</T>
                  <T size={12} color={colors.muted}>
                    {it.installment ? `${it.installment.index}/${it.installment.total} · ` : ''}vence {formatDate(it.date)}
                  </T>
                </View>
                <T size={13.5} weight="semibold">{formatMoney(it.amount)}</T>
                <Checkbox checked={it.paid} onPress={() => { db.setPaid(it.key, !it.paid); refresh(); }} />
              </View>
            )) : null}
          </View>
        );
      })}
    </Card>
  );
}

/** Cartão-resumo de um contrato, usado na lista e no Planejamento. */
export function LoanCard({ s, onPress }: { s: LoanSummary; onPress: () => void }) {
  const { ledger } = useStore();
  const cat = ledger.category(s.loan.category_id);
  const n = s.parcels.length;
  const done = n - s.remainingCount;
  return (
    <Card padded={false} style={{ marginBottom: 10, opacity: s.finished ? 0.7 : 1 }}>
      <ListRow
        icon={cat?.icon ?? 'bank-outline'}
        iconColor={cat?.color ?? colors.primary}
        title={s.loan.description}
        subtitle={[TYPE_LABEL[s.loan.type], s.loan.lender, `${n}x`].filter(Boolean).join(' · ')}
        onPress={onPress}
        right={<T size={15} weight="semibold">{formatMoney(s.finished ? s.effectiveTotal : s.remaining)}</T>}
      />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
        <ProgressBar value={n ? done / n : 0} color={s.finished ? colors.muted : colors.primary} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={12.5} color={colors.muted}>
            {s.finished ? 'Quitado' : `${done} de ${n} pagas${s.next ? ` · próxima ${formatDate(s.next.date)}` : ''}`}
          </T>
          <T size={12.5} color={s.savings > 0 ? colors.primary : colors.textSecondary}>
            {s.savings > 0 ? `Economizou ${formatMoney(s.savings)}` : s.finished ? '' : 'restante'}
          </T>
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- cadastro

export function LoanFormScreen({ route, navigation }: RootProps<'LoanForm'>) {
  const insets = useSafeAreaInsets();
  const { ledger, refresh } = useStore();
  const existing = route.params?.id ? ledger.loan(route.params.id) : undefined;
  const initialAmounts = existing ? loanAmounts(existing) : [];

  const [type, setType] = useState<LoanType>(existing?.type ?? route.params?.type ?? 'emprestimo');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [lender, setLender] = useState(existing?.lender ?? '');
  const [principal, setPrincipal] = useState(existing?.principal_cents ?? 0);
  const [releaseDate, setReleaseDate] = useState(existing?.release_date ?? today());
  const [asIncome, setAsIncome] = useState(existing ? !!existing.as_income : route.params?.type !== 'financiamento');
  const [count, setCount] = useState(String(initialAmounts.length || 12));
  const [firstDue, setFirstDue] = useState(existing?.first_due ?? dateInMonth(addMonths(monthOf(today()), 1), dayOf(today())));
  const [parcel, setParcel] = useState(initialAmounts[0] ?? 0);
  const [parcels, setParcels] = useState<number[] | null>(
    initialAmounts.length && new Set(initialAmounts).size > 1 ? initialAmounts : null,
  );
  const [method, setMethod] = useState<Method>(existing?.method ?? 'boleto');
  const [categoryId, setCategoryId] = useState<number | null>(existing?.category_id ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  useLayoutEffect(() => {
    navigation.setOptions({ title: existing ? 'Editar contrato' : 'Novo contrato' });
  }, [navigation, existing]);

  const n = Math.min(480, Math.max(1, parseInt(count, 10) || 0));
  const amounts = parcels ?? Array(n).fill(parcel);
  const contract = amounts.reduce((s, v) => s + v, 0);
  const interest = contract - principal;
  const rate = loanRate(principal, releaseDate, amounts.map((a, i) => ({ date: loanParcelDate({ first_due: firstDue }, i), amount: a })));
  const categories = ledger.snap.categories.filter((c) => c.kind === 'expense' && (!c.archived || c.id === categoryId));
  const monthOfParcel = (i: number) => addMonths(monthOf(firstDue), i);

  /** Número de parcelas mudou: a lista acompanha, repetindo o último valor. */
  const changeCount = (t: string) => {
    setCount(t.replace(/\D/g, '').slice(0, 3));
    const m = Math.min(480, Math.max(1, parseInt(t, 10) || 0));
    if (parcels && m !== parcels.length) {
      const last = parcels[parcels.length - 1] ?? 0;
      setParcels(m <= parcels.length ? parcels.slice(0, m) : [...parcels, ...Array(m - parcels.length).fill(last)]);
    }
  };

  const toggleCustom = (on: boolean) => {
    if (on) setParcels(Array(n).fill(parcel));
    else { setParcel(parcels?.[0] ?? parcel); setParcels(null); }
  };

  const save = () => {
    if (!description.trim()) return Alert.alert('Dê um nome ao contrato', 'Ex.: Empréstimo pessoal, Financiamento do carro.');
    if (principal <= 0) return Alert.alert('Informe o valor liberado', 'Quanto você recebeu ou quanto foi financiado.');
    if (!(parseInt(count, 10) > 0)) return Alert.alert('Informe o número de parcelas');
    if (amounts.some((v) => v <= 0)) return Alert.alert('Informe o valor das parcelas', 'Toda parcela precisa ter valor.');
    if (releaseDate >= firstDue) return Alert.alert('Confira as datas', 'A data da contratação precisa ser antes do 1º vencimento.');
    if (existing) {
      const prepaid = ledger.snap.loanPrepayments.filter((p) => p.loan_id === existing.id).flatMap((p) => JSON.parse(p.indices) as number[]);
      if (prepaid.some((i) => i >= n)) {
        return Alert.alert('Parcelas antecipadas', 'Há antecipações de parcelas que deixariam de existir. Remova a antecipação antes de diminuir o número de parcelas.');
      }
    }
    const id = db.saveLoan({
      id: existing?.id,
      type,
      description: description.trim(),
      lender: lender.trim() || null,
      category_id: categoryId,
      principal_cents: principal,
      release_date: releaseDate,
      as_income: asIncome ? 1 : 0,
      first_due: firstDue,
      installment_amounts: JSON.stringify(amounts),
      method,
      notes: notes.trim() || null,
    });
    // dinheiro que já caiu entra como recebido
    if (!existing && asIncome && releaseDate <= today()) db.setPaid(`li:${id}`, true);
    refresh();
    if (existing) navigation.goBack();
    else navigation.replace('LoanDetail', { id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FormScroll contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 24 }}>
        <Segmented
          value={type}
          onChange={(t) => { setType(t); if (!existing) setAsIncome(t === 'emprestimo'); }}
          options={[{ value: 'emprestimo', label: 'Empréstimo' }, { value: 'financiamento', label: 'Financiamento' }]}
        />
        <Field label="Nome">
          <Input value={description} onChangeText={setDescription} placeholder={type === 'emprestimo' ? 'Ex.: Empréstimo pessoal' : 'Ex.: Financiamento do carro'} />
        </Field>
        <Field label="Banco ou financeira (opcional)">
          <Input value={lender} onChangeText={setLender} placeholder="Ex.: Itaú, Caixa, BV" />
        </Field>

        <View style={styles.amountBox}>
          <T size={13} color={colors.muted} align="center">{type === 'emprestimo' ? 'Valor liberado' : 'Valor financiado'}</T>
          <MoneyInput value={principal} onChange={setPrincipal} big />
        </View>

        <Field
          label={type === 'emprestimo' ? 'Data em que pegou o empréstimo' : 'Data da contratação'}
          hint={releaseDate >= firstDue
            ? 'Essa data precisa ser antes do 1º vencimento.'
            : 'Os juros correm a partir dela: muda a taxa e o desconto ao antecipar parcelas.'}
        >
          <DateButton value={releaseDate} onChange={setReleaseDate} />
        </Field>

        <View style={styles.switchRow}>
          <Icon name="cash-plus" size={20} color={asIncome ? colors.income : colors.muted} />
          <View style={{ flex: 1 }}>
            <T>Entrou dinheiro na minha conta</T>
            <T size={12} color={colors.muted}>
              {asIncome ? `O valor liberado conta como receita em ${monthLabel(ledger.cycleOf(releaseDate))}.` : 'O valor liberado não entra como receita.'}
            </T>
          </View>
          <Switch value={asIncome} onValueChange={setAsIncome} trackColor={{ true: colors.primaryDark, false: colors.surface3 }} thumbColor={asIncome ? colors.primary : colors.muted} />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Field label="Parcelas" style={{ width: 110 }}>
            <Input value={count} onChangeText={changeCount} keyboardType="number-pad" style={{ textAlign: 'center' }} />
          </Field>
          <Field label="1º vencimento" style={{ flex: 1 }}>
            <DateButton value={firstDue} onChange={setFirstDue} />
          </Field>
        </View>

        {parcels == null ? (
          <Field label="Valor de cada parcela">
            <MoneyInput value={parcel} onChange={setParcel} />
          </Field>
        ) : null}
        <View style={styles.switchRow}>
          <Icon name="format-list-numbered" size={20} color={parcels ? colors.primary : colors.muted} />
          <View style={{ flex: 1 }}>
            <T>Parcelas com valores diferentes</T>
            <T size={12} color={colors.muted}>Tabela SAC, carência, parcela intermediária...</T>
          </View>
          <Switch value={parcels != null} onValueChange={toggleCustom} trackColor={{ true: colors.primaryDark, false: colors.surface3 }} thumbColor={parcels ? colors.primary : colors.muted} />
        </View>
        {parcels ? <ParcelEditor values={parcels} onChange={setParcels} labelOf={monthOfParcel} /> : null}

        <View style={styles.preview}>
          <Row label="Total do contrato" value={formatMoney(contract)} />
          {contract > 0 && principal > 0 ? (
            <>
              <Row
                label="Juros e encargos"
                value={`${formatMoney(interest)} (${((interest / principal) * 100).toFixed(1).replace('.', ',')}%)`}
                color={interest > 0 ? colors.warning : colors.textSecondary}
              />
              <RateRows rate={rate} />
            </>
          ) : null}
          <Row label="Última parcela" value={monthLabel(monthOfParcel(n - 1))} />
        </View>

        <Field label="Como paga as parcelas">
          <View style={styles.wrap}>
            {LOAN_METHODS.map((m) => (
              <Chip key={m} label={m === 'debito' ? 'Débito em conta' : METHOD_LABELS[m]} icon={METHOD_ICONS[m]} active={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>
        </Field>

        <Field label="Categoria">
          <View style={styles.wrap}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} active={categoryId === c.id} onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} />
            ))}
          </View>
        </Field>

        <Field label="Observação (opcional)">
          <Input value={notes} onChangeText={setNotes} placeholder="Taxa, número do contrato..." multiline style={{ height: 76, paddingTop: 12, textAlignVertical: 'top' }} />
        </Field>

        {existing ? (
          <Button
            title="Excluir contrato"
            icon="trash-can-outline"
            variant="danger"
            onPress={() => Alert.alert('Excluir contrato', `"${existing.description}" e todas as parcelas e antecipações serão apagados.`, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Excluir', style: 'destructive', onPress: () => { db.deleteLoan(existing.id); refresh(); navigation.pop(2); } },
            ])}
          />
        ) : null}
      </FormScroll>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={existing ? 'Salvar alterações' : 'Cadastrar contrato'} icon="check" onPress={save} />
      </View>
    </View>
  );
}

/** Taxa ao mês e ao ano; some quando não dá para calcular (valores incoerentes). */
function RateRows({ rate, label = 'Taxa' }: { rate: { monthly: number; yearly: number } | null; label?: string }) {
  if (!rate) return <Row label={label} value="—" color={colors.muted} />;
  return (
    <>
      <Row label={`${label} ao mês`} value={formatRate(rate.monthly)} color={colors.warning} />
      <Row label={`${label} ao ano`} value={formatRate(rate.yearly)} color={colors.warning} />
    </>
  );
}

function Row({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <T size={13.5} color={colors.textSecondary}>{label}</T>
      <T size={14.5} weight="semibold" color={color}>{value}</T>
    </View>
  );
}

// ---------------------------------------------------------------- detalhe

const STATUS: Record<LoanParcel['status'], { label: string; color: string; icon: string }> = {
  paid: { label: 'Paga', color: colors.primary, icon: 'check-circle' },
  prepaid: { label: 'Antecipada', color: '#3987E5', icon: 'fast-forward' },
  late: { label: 'Atrasada', color: colors.danger, icon: 'alert-circle-outline' },
  open: { label: 'Em aberto', color: colors.muted, icon: 'clock-outline' },
};

export function LoanDetailScreen({ route, navigation }: RootProps<'LoanDetail'>) {
  const { ledger, refresh } = useStore();
  const loan = ledger.loan(route.params.id);
  const [prepaying, setPrepaying] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: loan ? TYPE_LABEL[loan.type] : 'Contrato',
      headerRight: () => loan ? (
        <Pressable hitSlop={10} onPress={() => navigation.navigate('LoanForm', { id: loan.id })}>
          <Icon name="pencil-outline" size={22} color={colors.text} />
        </Pressable>
      ) : null,
    });
  }, [navigation, loan]);

  if (!loan) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const s = ledger.loanSummary(loan);
  const now = today();
  const n = s.parcels.length;
  // quitar tudo hoje: o que falta trazido a valor presente pela taxa do contrato
  const payoffToday = s.parcels
    .filter((p) => p.status === 'open' || p.status === 'late')
    .reduce((sum, p) => sum + prepayValue(p.amount, p.date, now, s.rate?.monthly), 0);
  const done = n - s.remainingCount;
  // o começo da lista é o que interessa: da primeira em aberto em diante, mais as últimas pagas
  const firstOpen = s.parcels.findIndex((p) => p.status === 'open' || p.status === 'late');
  const from = showAll ? 0 : Math.max(0, (firstOpen < 0 ? n : firstOpen) - 2);
  const visible = showAll ? s.parcels : s.parcels.slice(from, from + 14);

  const toggleParcel = (p: LoanParcel) => {
    if (p.status === 'prepaid') return;
    db.setPaid(p.key, p.status !== 'paid');
    refresh();
  };

  const removePrepayment = (id: number) => {
    Alert.alert('Desfazer antecipação', 'As parcelas voltam para os meses de origem, em aberto.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desfazer', style: 'destructive', onPress: () => { db.deleteLoanPrepayment(id); refresh(); } },
    ]);
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ padding: 20, gap: 4 }}>
          <T size={13} color={colors.muted}>{[loan.lender, `${n} parcelas`, `desde ${formatDate(loan.release_date)}`].filter(Boolean).join(' · ')}</T>
          <T size={18} weight="bold">{loan.description}</T>
          <T size={12.5} color={colors.muted} style={{ marginTop: 10 }}>{s.finished ? 'Contrato quitado' : 'Saldo devedor'}</T>
          <T size={32} weight="extrabold" style={{ letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(s.finished ? s.effectiveTotal : s.remaining)}
          </T>
          <View style={{ marginTop: 10, gap: 6 }}>
            <ProgressBar value={n ? done / n : 0} />
            <T size={12.5} color={colors.muted}>{done} de {n} parcelas quitadas{s.next ? ` · próxima ${formatDate(s.next.date)}: ${formatMoney(s.next.amount)}` : ''}</T>
          </View>

          <View style={{ marginTop: 16, gap: 10 }}>
            <Row label={loan.type === 'emprestimo' ? 'Valor liberado' : 'Valor financiado'} value={formatMoney(loan.principal_cents)} />
            <Row label="Contratado em" value={formatDate(loan.release_date)} />
            <Row label="Total do contrato" value={formatMoney(s.contract)} />
            <Row label="Juros e encargos previstos" value={formatMoney(s.interest)} color={colors.warning} />
            <RateRows rate={s.rate} label="Taxa do contrato" />
            <Divider />
            <Row label="Já pago" value={formatMoney(s.paid)} color={colors.primary} />
            {s.savings > 0 ? <Row label="Economia com antecipações" value={formatMoney(s.savings)} color={colors.primary} /> : null}
            {s.effectiveRate && Math.abs(s.effectiveRate.monthly - (s.rate?.monthly ?? 0)) > 0.00005 ? <RateRows rate={s.effectiveRate} label="Taxa efetiva" /> : null}
            {!s.finished && s.rate && payoffToday < s.remaining ? (
              <View style={styles.payoff}>
                <View style={{ flex: 1 }}>
                  <T size={13.5} weight="semibold">Quitar tudo hoje</T>
                  <T size={12} color={colors.muted}>Estimativa com desconto dos juros · economia de {formatMoney(s.remaining - payoffToday)}</T>
                </View>
                <T size={16} weight="bold" color={colors.primary}>{formatMoney(payoffToday)}</T>
              </View>
            ) : null}
            <Row label="Custo final do contrato" value={formatMoney(s.effectiveTotal)} />
          </View>

          <T size={11.5} color={colors.muted} style={{ marginTop: 10, lineHeight: 16 }}>
            A taxa é calculada pelas datas reais: o valor liberado em {formatDate(loan.release_date)} contra cada parcela no seu vencimento. Se a data da contratação estiver errada, corrija no lápis lá em cima: a taxa e os descontos de antecipação mudam junto.
            {s.effectiveRate ? ' A taxa efetiva considera o que você pagou nas antecipações.' : ''}
          </T>

          {!s.finished ? (
            <Button style={{ marginTop: 16 }} title="Antecipar parcelas" icon="fast-forward" onPress={() => setPrepaying(true)} />
          ) : null}
        </Card>

        {s.prepayments.length ? (
          <>
            <SectionTitle title="Antecipações" />
            <Card padded={false} style={{ paddingVertical: 4 }}>
              {s.prepayments.map((p, i) => (
                <View key={p.id}>
                  {i > 0 && <Divider />}
                  <ListRow
                    icon="fast-forward"
                    iconColor="#3987E5"
                    title={`${p.indices_list.length === 1 ? 'Parcela' : 'Parcelas'} ${p.indices_list.map((x) => x + 1).join(', ')}`}
                    subtitle={`${formatDate(p.date)} · valia ${formatMoney(p.original)} · economia ${formatMoney(p.original - p.amount_cents)}`}
                    onLongPress={() => removePrepayment(p.id)}
                    onPress={() => removePrepayment(p.id)}
                    right={<T size={15} weight="semibold">{formatMoney(p.amount_cents)}</T>}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionTitle title="Parcelas" right={<T size={12.5} color={colors.muted}>toque para marcar como paga</T>} />
        <Card padded={false} style={{ paddingVertical: 4 }}>
          {visible.map((p, i) => {
            const st = STATUS[p.status];
            return (
              <View key={p.index}>
                {i > 0 && <Divider />}
                <Pressable onPress={() => toggleParcel(p)} style={({ pressed }) => [styles.parcelRow, pressed && { backgroundColor: colors.surface2 }]}>
                  <View style={[styles.parcelNum, { borderColor: st.color }]}>
                    <T size={12.5} weight="semibold" color={st.color}>{p.index + 1}</T>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <T size={14.5} weight="medium">{formatDateLong(p.date)}</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name={st.icon} size={13} color={st.color} />
                      <T size={12} color={st.color}>{st.label}</T>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T size={15} weight="semibold" color={p.status === 'prepaid' ? colors.muted : colors.text} style={p.status === 'prepaid' ? { textDecorationLine: 'line-through' } : undefined}>
                      {formatMoney(p.amount)}
                    </T>
                    {p.status === 'open' && p.date > now && s.rate ? (
                      <T size={11.5} color={colors.primary}>hoje {formatMoney(prepayValue(p.amount, p.date, now, s.rate.monthly))}</T>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Card>
        {n > visible.length ? (
          <Button variant="ghost" title={`Ver todas as ${n} parcelas`} onPress={() => setShowAll(true)} style={{ marginTop: 8 }} />
        ) : null}
        {loan.notes ? (
          <View style={styles.note}>
            <Icon name="text-box-outline" size={18} color={colors.muted} />
            <T size={13} color={colors.textSecondary} style={{ flex: 1 }}>{loan.notes}</T>
          </View>
        ) : null}
      </ScrollView>

      <PrepaySheet visible={prepaying} onClose={() => setPrepaying(false)} summary={s} onDone={() => { setPrepaying(false); refresh(); }} />
    </>
  );
}

/**
 * Antecipação: escolhe as parcelas (o comum é quitar de trás para frente, que é onde
 * o desconto de juros é maior) e informa quanto pagou e quando.
 */
export function PrepaySheet({ visible, onClose, summary, onDone, initial }: {
  visible: boolean; onClose: () => void; summary: LoanSummary; onDone: () => void;
  /** Parcelas já marcadas ao abrir (0-based), ex.: a parcela tocada na lista do mês. */
  initial?: number[];
}) {
  const open = summary.parcels.filter((p) => p.status === 'open' || p.status === 'late');
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial ?? []));
  const [paid, setPaid] = useState<number | null>(null);
  const [date, setDate] = useState(today());

  const original = useMemo(() => open.filter((p) => selected.has(p.index)).reduce((s, p) => s + p.amount, 0), [open, selected]);
  const monthly = summary.rate?.monthly;
  const estimated = useMemo(
    () => open.filter((p) => selected.has(p.index)).reduce((s, p) => s + prepayValue(p.amount, p.date, date, monthly), 0),
    [open, selected, date, monthly],
  );
  // até a pessoa digitar o valor do boleto, vale a estimativa pela taxa do contrato
  const amount = paid ?? estimated;
  const savings = original - amount;

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
    setPaid(null);
  };
  /** Seleciona as últimas `k` parcelas em aberto. */
  const lastK = (k: number) => { setSelected(new Set(open.slice(-k).map((p) => p.index))); setPaid(null); };

  const confirm = () => {
    if (!selected.size) return Alert.alert('Escolha as parcelas', 'Marque quais parcelas você antecipou.');
    if (amount <= 0) return Alert.alert('Informe o valor pago');
    db.addLoanPrepayment(summary.loan.id, date, amount, [...selected]);
    setSelected(new Set());
    setPaid(null);
    onDone();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Antecipar parcelas">
      <View style={{ paddingHorizontal: 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[1, 2, 3, 6, 12].filter((k) => k < open.length).map((k) => (
            <Chip key={k} label={k === 1 ? 'Última' : `Últimas ${k}`} onPress={() => lastK(k)} />
          ))}
          <Chip label="Todas" onPress={() => lastK(open.length)} />
        </View>
        <ScrollView style={{ maxHeight: 220, backgroundColor: colors.surface2, borderRadius: 12 }} nestedScrollEnabled>
          {open.map((p) => (
            <Pressable key={p.index} onPress={() => toggle(p.index)} style={styles.pickRow}>
              <Checkbox checked={selected.has(p.index)} onPress={() => toggle(p.index)} />
              <T size={14} style={{ flex: 1 }}>{p.index + 1}ª · {monthShort(monthOf(p.date), true)}</T>
              <T size={14} weight="semibold">{formatMoney(p.amount)}</T>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={13} color={colors.muted}>{selected.size} parcelas · valor original</T>
          <T size={13} weight="semibold">{formatMoney(original)}</T>
        </View>
        {selected.size && monthly ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} color={colors.muted}>Estimado em {formatDate(date)} (taxa {formatRate(monthly)} a.m.)</T>
            <T size={13} weight="semibold" color={colors.primary}>{formatMoney(estimated)}</T>
          </View>
        ) : null}
        <Field label="Quanto você pagou (com o desconto)" hint={paid == null && selected.size ? 'Preenchido com a estimativa. Troque pelo valor do boleto do banco.' : undefined}>
          <MoneyInput value={amount} onChange={setPaid} />
        </Field>
        <Field label="Data do pagamento">
          <DateButton value={date} onChange={setDate} />
        </Field>
        {selected.size ? (
          <T size={13.5} color={savings > 0 ? colors.primary : colors.textSecondary} align="center">
            {savings > 0 ? `Economia de ${formatMoney(savings)} em juros` : savings < 0 ? `Pagou ${formatMoney(-savings)} a mais que o valor original` : 'Sem desconto'}
          </T>
        ) : null}
        <Button title="Registrar antecipação" icon="check" onPress={confirm} disabled={!selected.size} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  amountBox: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 12, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, minHeight: 54, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, height: 50, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  preview: { gap: 8, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  parcelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  parcelNum: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  payoff: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  monthItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 26, paddingRight: 14, paddingVertical: 8, backgroundColor: colors.surface2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 46 },
  note: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginTop: 14 },
});

