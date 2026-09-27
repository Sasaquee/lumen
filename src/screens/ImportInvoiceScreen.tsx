import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { colors } from '../theme';
import { Button, Card, Checkbox, Chip, Divider, Field, Icon, Input, MoneyInput, MonthSwitcher, SectionTitle, Sheet, T } from '../components/ui';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { pauseLock } from '../data/lock';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { invoiceDates } from '../data/engine';
import { parseNubankCsv } from '../data/import/csv';
import { parseInvoicePrints, type OcrPage } from '../data/import/ocr';
import { entryFor, parcelsWith, planImport, type ImportPlan, type ImportSource, type Proposal } from '../data/import/reconcile';
import type { ParsedInvoice, ParsedLine } from '../data/import/types';
import { formatDate, formatDateLong, fromISODate, monthLabel, toISODate, today } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { recognize } from '../../modules/lumen-ocr';

interface Loaded {
  source: ImportSource;
  parsed: ParsedInvoice;
  fileLabel: string;
}

export default function ImportInvoiceScreen({ route, navigation }: RootProps<'ImportInvoice'>) {
  const insets = useSafeAreaInsets();
  const { ledger, refresh } = useStore();
  const card = ledger.card(route.params.cardId);
  const [month, setMonth] = useState(route.params.month);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // escolhas do usuário por linha: entra ou não, categoria, descrição
  const [edits, setEdits] = useState<Record<string, Partial<Pick<Proposal, 'include' | 'categoryId' | 'description'>>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [useTotal, setUseTotal] = useState(true);
  const [showKept, setShowKept] = useState(false);
  // correções da pessoa no que foi lido (valor, data, parcela): entram antes da comparação
  const [lineEdits, setLineEdits] = useState<Record<number, Partial<ParsedLine>>>({});
  const [ocrNotice, setOcrNotice] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({ title: card ? `Importar fatura · ${card.name}` : 'Importar fatura' });
  }, [navigation, card]);

  const plan: ImportPlan | null = useMemo(() => {
    if (!card || !loaded) return null;
    return planImport({
      lines: loaded.parsed.lines.map((l, i) => ({ ...l, ...lineEdits[i] })),
      card,
      month,
      entries: ledger.snap.entries,
      invoiceItems: ledger.invoice(card.id, month)?.items ?? [],
      categories: ledger.snap.categories,
      entryInvoiceMonth: (e) => ledger.entryInvoiceMonth(card, e),
    });
  }, [card, loaded, month, ledger, lineEdits]);

  if (!card) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const payCycle = ledger.invoiceCycle(card, month);
  const { dueDate } = invoiceDates(card, month);
  const proposals = (plan?.proposals ?? []).map((p) => ({ ...p, ...edits[p.id] }));
  const fresh = proposals.filter((p) => p.status === 'new');
  const changed = proposals.filter((p) => p.status === 'changed');
  const kept = proposals.filter((p) => p.status === 'kept');
  const removed = plan?.removed ?? [];
  const toAdd = fresh.filter((p) => p.include);
  const realChanges = changed.filter((p) => !p.rounding);
  const importedSum = proposals.filter((p) => p.status !== 'new' || p.include).reduce((s, p) => s + p.line.amount, 0);
  const total = loaded?.parsed.total ?? null;
  const suggested = loaded?.parsed.dueMonth;

  const setEdit = (id: string, patch: Partial<Proposal>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const load = (l: Loaded) => {
    setEdits({});
    setLineEdits({});
    setLoaded(l);
    setUseTotal(l.parsed.total != null);
    // o mês é o que você escolheu; o nome do CSV só sugere (aviso logo abaixo)
  };

  const lineIndex = (id: string) => Number(id.slice(1));
  const setLineEdit = (id: string, patch: Partial<ParsedLine>) =>
    setLineEdits((e) => ({ ...e, [lineIndex(id)]: { ...e[lineIndex(id)], ...patch } }));

  const pickCsv = async () => {
    pauseLock();
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy('Lendo o CSV...');
      const asset = res.assets[0];
      const text = await new File(asset.uri).text();
      load({ source: 'csv', parsed: parseNubankCsv(text, asset.name), fileLabel: asset.name });
    } catch (e: any) {
      Alert.alert('Não consegui ler o arquivo', String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const pickPrints = async () => {
    pauseLock();
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: 12,
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      const pages: OcrPage[] = [];
      for (let i = 0; i < res.assets.length; i++) {
        setBusy(res.assets.length > 1 ? `Lendo o print ${i + 1} de ${res.assets.length}...` : 'Lendo o print...');
        pages.push(await recognize(res.assets[i].uri));
      }
      const parsed = parseInvoicePrints(pages, month, today());
      load({ source: 'print', parsed, fileLabel: `${pages.length} ${pages.length === 1 ? 'print' : 'prints'}` });
    } catch (e: any) {
      Alert.alert('Não consegui ler os prints', String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!plan || !loaded) return;
    const update = changed.map((p) => {
      const e = ledger.snap.entries.find((x) => x.id === p.matchId)!;
      return { entryId: e.id, amounts: parcelsWith(e, p.matchIndex!, p.line.amount) };
    });
    db.applyInvoiceImport({
      remove: removed.map((r) => r.entryId),
      add: toAdd.map((p) => entryFor(p, card, month, loaded.source)),
      update,
      total: useTotal && total != null ? { cardId: card.id, month, amountCents: total } : null,
    });
    refresh();
    navigation.popTo('Invoice', { cardId: card.id, month });
  };

  const confirm = () => {
    if (!plan) return;
    const nothing = !toAdd.length && !removed.length && !changed.length && !(useTotal && total != null);
    if (nothing) {
      Alert.alert('Nada para importar', plan.hadImport ? 'A fatura já está igual a este arquivo.' : 'Nenhum lançamento foi marcado para entrar.');
      return;
    }
    // reimportação que muda alguma coisa: mostra o que entra e o que sai antes de substituir
    if (plan.hadImport && (toAdd.length || removed.length || realChanges.length)) {
      const parts = [
        toAdd.length ? `Entram ${toAdd.length}: ${toAdd.slice(0, 4).map((p) => p.description).join(', ')}${toAdd.length > 4 ? '...' : ''}` : null,
        removed.length ? `Saem ${removed.length}: ${removed.slice(0, 4).map((r) => r.description).join(', ')}${removed.length > 4 ? '...' : ''}` : null,
        realChanges.length ? `Mudam de valor: ${realChanges.length}` : null,
      ].filter(Boolean);
      Alert.alert(
        'Substituir a importação?',
        `Esta fatura já tinha sido importada. Comparando com o arquivo novo:\n\n${parts.join('\n\n')}\n\nTem certeza que quer substituir?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Substituir', style: 'destructive', onPress: apply }],
      );
      return;
    }
    apply();
  };

  const editingProposal = proposals.find((p) => p.id === editing);

  /** Parcela corrigida à mão; 1 de 1 (ou inválida) vira compra à vista. */
  const setInstallment = (p: Proposal, index: number, totalN: number) => {
    const valid = totalN >= 2 && index >= 1 && index <= totalN;
    setLineEdit(p.id, { installment: valid ? { index, total: totalN } : totalN >= 2 ? { index: Math.min(Math.max(index, 1), totalN), total: totalN } : undefined });
  };
  const expenseCats = ledger.snap.categories.filter((c) => c.kind === 'expense' && !c.archived);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <MonthSwitcher
          month={payCycle}
          onChange={(c) => setMonth(ledger.invoiceMonthOfCycle(card, c))}
          hint={`Fatura que vence ${formatDate(dueDate)}`}
        />

        {!loaded ? (
          <>
            <T size={13.5} color={colors.textSecondary} style={{ marginTop: 16, marginBottom: 4, lineHeight: 20, paddingHorizontal: 4 }}>
              Escolha o mês da fatura e de onde vêm os lançamentos. Nada é salvo antes de você conferir.
            </T>
            <SourceCard
              icon="file-delimited-outline"
              title="Arquivo CSV"
              text="O do Nubank (disponível mesmo com a fatura aberta) ou um que você montou numa planilha — veja o modelo em Como funciona. Importe de novo quando quiser atualizar."
              onPress={pickCsv}
            />
            <SourceCard
              icon="cellphone-screenshot"
              title="Prints da fatura"
              text="Neon, Mercado Pago, Itaú e outros: tire prints da lista de lançamentos e escolha na ordem, de cima para baixo. Pode escolher vários."
              onPress={pickPrints}
            />
            <Pressable onPress={() => navigation.navigate('ImportHelp')} style={styles.helpLink}>
              <Icon name="book-open-variant" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <T size={14} weight="semibold">Como funciona e dicas</T>
                <T size={12} color={colors.muted}>Montar um CSV, tirar um bom print e o que acontece com os dados</T>
              </View>
              <Icon name="chevron-right" color={colors.muted} />
            </Pressable>
            <View style={styles.privacy}>
              <Icon name="shield-lock-outline" size={16} color={colors.primary} />
              <T size={12} color={colors.textSecondary} style={{ flex: 1, lineHeight: 17 }}>
                Tudo acontece no seu celular, sem internet: o arquivo e os prints são lidos aqui mesmo e nada é enviado para lugar nenhum.
              </T>
            </View>
          </>
        ) : (
          <>
            <Card style={{ marginTop: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={loaded.source === 'csv' ? 'file-delimited-outline' : 'cellphone-screenshot'} size={18} color={colors.textSecondary} />
                <T size={13} color={colors.textSecondary} style={{ flex: 1 }} numberOfLines={1}>{loaded.fileLabel}</T>
                <Pressable hitSlop={8} onPress={() => setLoaded(null)}>
                  <T size={13} color={colors.primary} weight="medium">Trocar</T>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <T size={12} color={colors.muted}>Lançamentos na fatura</T>
                  <T size={24} weight="extrabold">{formatMoney(importedSum)}</T>
                </View>
                <T size={13} color={colors.textSecondary}>{proposals.filter((p) => p.status !== 'new' || p.include).length} itens</T>
              </View>
              {total != null ? (
                <View style={styles.totalRow}>
                  <View style={{ flex: 1 }}>
                    <T size={13.5}>Total no print: <T size={13.5} weight="semibold">{formatMoney(total)}</T></T>
                    <T size={12} color={colors.muted}>
                      {total === importedSum ? 'Bate com os lançamentos.' : `Diferença de ${formatMoney(total - importedSum)} fica como "não detalhado".`}
                    </T>
                  </View>
                  <Switch value={useTotal} onValueChange={setUseTotal} trackColor={{ true: colors.primaryDark, false: colors.surface3 }} thumbColor={useTotal ? colors.primary : colors.muted} />
                </View>
              ) : null}
              {suggested && suggested !== month ? (
                <Pressable onPress={() => setMonth(suggested)} style={styles.warn}>
                  <Icon name="calendar-alert" size={18} color={colors.warning} />
                  <T size={12.5} color={colors.textSecondary} style={{ flex: 1 }}>
                    O nome do arquivo indica a fatura de {monthLabel(suggested)}. Toque para usar esse mês.
                  </T>
                </Pressable>
              ) : null}
              {loaded.source === 'print' && ocrNotice ? (
                <View style={styles.ocrNotice}>
                  <Icon name="eye-check-outline" size={18} color={colors.primary} />
                  <T size={12.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
                    A leitura de print pode errar um detalhe (um dígito, uma data, uma parcela). Confira os valores com a fatura
                    do banco e toque num item para corrigir antes de importar.
                  </T>
                  <Pressable hitSlop={8} onPress={() => setOcrNotice(false)}>
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ) : null}
              {loaded.parsed.warnings.map((w) => (
                <View key={w} style={styles.warn}>
                  <Icon name="alert-outline" size={18} color={colors.warning} />
                  <T size={12.5} color={colors.textSecondary} style={{ flex: 1 }}>{w}</T>
                </View>
              ))}
            </Card>

            {plan?.hadImport ? (
              <View style={styles.compare}>
                <Icon name="compare-horizontal" size={20} color={colors.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={13.5} weight="semibold">Esta fatura já foi importada</T>
                  <T size={12.5} color={colors.textSecondary}>
                    {toAdd.length} {toAdd.length === 1 ? 'entrou' : 'entraram'} · {removed.length} {removed.length === 1 ? 'saiu' : 'saíram'} · {realChanges.length} com outro valor · {kept.length} iguais
                  </T>
                </View>
              </View>
            ) : null}

            {fresh.length ? (
              <>
                <SectionTitle title={plan?.hadImport ? 'Entraram' : 'Lançamentos'} right={<T size={12.5} color={colors.muted}>toque para editar</T>} />
                <Card padded={false} style={{ paddingVertical: 4 }}>
                  {fresh.map((p, i) => (
                    <View key={p.id}>
                      {i > 0 && <Divider />}
                      <ProposalRow p={p} onToggle={() => setEdit(p.id, { include: !p.include })} onPress={() => setEditing(p.id)} />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {changed.length ? (
              <>
                <SectionTitle title="Mudaram de valor" />
                <Card padded={false} style={{ paddingVertical: 4 }}>
                  {changed.map((p, i) => (
                    <View key={p.id}>
                      {i > 0 && <Divider />}
                      <SimpleRow
                        icon="swap-vertical"
                        color={p.rounding ? colors.muted : colors.warning}
                        title={p.description}
                        subtitle={`${instLabel(p)}${p.rounding ? 'arredondamento do banco, só esta parcela muda' : 'só esta parcela muda'}`}
                        right={`${formatMoney(p.matchAmount ?? 0)} → ${formatMoney(p.line.amount)}`}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {removed.length ? (
              <>
                <SectionTitle title="Saíram" />
                <Card padded={false} style={{ paddingVertical: 4 }}>
                  {removed.map((r, i) => (
                    <View key={r.entryId}>
                      {i > 0 && <Divider />}
                      <SimpleRow
                        icon="minus-circle-outline"
                        color={colors.danger}
                        title={r.description}
                        subtitle={`${r.installment ? `Parcela ${r.installment.index}/${r.installment.total} · ` : ''}não veio no arquivo novo e será apagado`}
                        right={formatMoney(r.amount)}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {kept.length ? (
              <>
                <SectionTitle
                  title={`Iguais (${kept.length})`}
                  right={<Pressable hitSlop={8} onPress={() => setShowKept(!showKept)}><T size={13} color={colors.primary}>{showKept ? 'Esconder' : 'Mostrar'}</T></Pressable>}
                />
                {showKept ? (
                  <Card padded={false} style={{ paddingVertical: 4 }}>
                    {kept.map((p, i) => (
                      <View key={p.id}>
                        {i > 0 && <Divider />}
                        <SimpleRow icon="check" color={colors.primary} title={p.description} subtitle={`${instLabel(p)}já importado`} right={formatMoney(p.line.amount)} />
                      </View>
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}

            {plan?.payments.length ? (
              <T size={12} color={colors.muted} style={{ marginTop: 14, paddingHorizontal: 4 }}>
                {plan.payments.length} {plan.payments.length === 1 ? 'pagamento de fatura ficou' : 'pagamentos de fatura ficaram'} de fora ({plan.payments.map((p) => formatMoney(p.amount)).join(', ')}).
              </T>
            ) : null}
          </>
        )}
      </ScrollView>

      {loaded ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button
            title={plan?.hadImport ? 'Atualizar fatura' : `Importar ${toAdd.length} ${toAdd.length === 1 ? 'lançamento' : 'lançamentos'}`}
            icon="check"
            onPress={confirm}
          />
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} size="large" />
          <T color={colors.textSecondary}>{busy}</T>
        </View>
      ) : null}

      <Sheet visible={!!editingProposal} onClose={() => setEditing(null)} title="Lançamento">
        {editingProposal ? (
          <View style={{ paddingHorizontal: 8, gap: 14 }}>
            <T size={12.5} color={colors.muted}>{loaded?.source === 'print' ? 'Lido no print' : 'No arquivo'}: {editingProposal.line.raw}</T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Valor desta parcela" style={{ flex: 1 }}>
                <MoneyInput
                  value={Math.abs(editingProposal.line.amount)}
                  onChange={(v) => setLineEdit(editingProposal.id, { amount: editingProposal.line.amount < 0 ? -v : v })}
                />
              </Field>
              <Field label="Data" style={{ width: 132 }}>
                <Pressable
                  style={styles.dateBtn}
                  onPress={() => DateTimePickerAndroid.open({
                    value: fromISODate(editingProposal.line.date),
                    mode: 'date',
                    onChange: (e, d) => { if (e.type === 'set' && d) setLineEdit(editingProposal.id, { date: toISODate(d) }); },
                  })}
                >
                  <T>{formatDateLong(editingProposal.line.date)}</T>
                </Pressable>
              </Field>
            </View>
            <Field label="Parcela" hint="Deixe 1 de 1 para compra à vista.">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Input
                  style={{ width: 64, textAlign: 'center' }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  maxLength={3}
                  value={String(editingProposal.line.installment?.index ?? 1)}
                  onChangeText={(t) => setInstallment(editingProposal, Number(t.replace(/\D/g, '')) || 1, editingProposal.line.installment?.total ?? 1)}
                />
                <T color={colors.muted}>de</T>
                <Input
                  style={{ width: 64, textAlign: 'center' }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  maxLength={3}
                  value={String(editingProposal.line.installment?.total ?? 1)}
                  onChangeText={(t) => setInstallment(editingProposal, editingProposal.line.installment?.index ?? 1, Number(t.replace(/\D/g, '')) || 1)}
                />
              </View>
            </Field>
            <Field label="Descrição">
              <Input value={editingProposal.description} onChangeText={(t) => setEdit(editingProposal.id, { description: t })} />
            </Field>
            <Field label="Categoria">
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {expenseCats.map((c) => (
                    <Chip
                      key={c.id} label={c.name} icon={c.icon} color={c.color}
                      active={editingProposal.categoryId === c.id}
                      onPress={() => setEdit(editingProposal.id, { categoryId: editingProposal.categoryId === c.id ? null : c.id })}
                    />
                  ))}
                </View>
              </ScrollView>
            </Field>
            {editingProposal.conflict ? <T size={12.5} color={colors.warning}>{editingProposal.conflict}</T> : null}
            <Button
              title={editingProposal.include ? 'Não importar este' : 'Importar este'}
              icon={editingProposal.include ? 'close' : 'plus'}
              variant="secondary"
              onPress={() => setEdit(editingProposal.id, { include: !editingProposal.include })}
            />
            <Button title="Pronto" icon="check" onPress={() => setEditing(null)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const instLabel = (p: Proposal) => (p.line.installment ? `Parcela ${p.line.installment.index}/${p.line.installment.total} · ` : '');

function SourceCard({ icon, title, text, onPress }: { icon: string; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.source, pressed && { backgroundColor: colors.surface2 }]}>
      <View style={styles.sourceIcon}><Icon name={icon} size={26} color={colors.primary} /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <T size={16} weight="semibold">{title}</T>
        <T size={12.5} color={colors.muted} style={{ lineHeight: 18 }}>{text}</T>
      </View>
      <Icon name="chevron-right" color={colors.muted} />
    </Pressable>
  );
}

function ProposalRow({ p, onToggle, onPress }: { p: Proposal; onToggle: () => void; onPress: () => void }) {
  const { ledger } = useStore();
  const cat = ledger.category(p.categoryId);
  const credit = p.line.amount < 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }, !p.include && { opacity: 0.5 }]}>
      <Checkbox checked={p.include} onPress={onToggle} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={14.5} weight="medium" numberOfLines={1}>{p.description}</T>
        <T size={12} color={colors.muted} numberOfLines={1}>
          {formatDate(p.line.date)} · {instLabel(p)}{cat ? cat.name : 'Sem categoria'}
        </T>
        {p.conflict ? <T size={11.5} color={colors.warning} numberOfLines={2}>{p.conflict}</T> : null}
      </View>
      <T size={14.5} weight="semibold" color={credit ? colors.income : colors.text}>{formatMoney(p.line.amount)}</T>
    </Pressable>
  );
}

function SimpleRow({ icon, color, title, subtitle, right }: { icon: string; color: string; title: string; subtitle: string; right: string }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={20} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={14.5} weight="medium" numberOfLines={1}>{title}</T>
        <T size={12} color={colors.muted} numberOfLines={2}>{subtitle}</T>
      </View>
      <T size={13.5} weight="semibold">{right}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  source: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, padding: 16, borderRadius: 18,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  sourceIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', gap: 8, padding: 12, marginTop: 12, borderRadius: 14, backgroundColor: colors.primarySoft },
  helpLink: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 14, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  ocrNotice: { flexDirection: 'row', gap: 8, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 },
  dateBtn: { height: 50, borderRadius: 14, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderRadius: 12, padding: 12 },
  warn: { flexDirection: 'row', gap: 8, backgroundColor: colors.warningSoft, borderRadius: 12, padding: 10 },
  compare: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,15,20,0.85)', alignItems: 'center', justifyContent: 'center', gap: 14 },
});
