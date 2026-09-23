import React, { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Button, Card, EmptyState, Field, Icon, Input, MoneyInput, Stepper, T } from '../components/ui';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { invoiceDates } from '../data/engine';
import { currentMonth, formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';

export function CardsScreen({ navigation }: RootProps<'Cards'>) {
  const { ledger } = useStore();
  const cards = ledger.snap.cards.filter((c) => !c.archived);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      {cards.length === 0 && (
        <Card>
          <EmptyState icon="credit-card-plus-outline" title="Nenhum cartão" text="Cadastre seus cartões com o dia de fechamento e vencimento para que as compras caiam na fatura certa." />
        </Card>
      )}
      {cards.map((c) => {
        // fatura atual: a próxima a vencer a partir de hoje
        const m = ledger.openInvoiceMonth(c);
        const inv = ledger.invoice(c.id, m);
        const used = ledger.cardCommitted(c.id, currentMonth());
        const available = c.limit_cents ? c.limit_cents - used : null;
        const pctUsed = c.limit_cents ? Math.round((used / c.limit_cents) * 100) : 0;
        return (
          <Pressable key={c.id} onPress={() => navigation.navigate('Invoice', { cardId: c.id, month: m })}>
            <View style={[styles.cardVisual, { backgroundColor: c.color }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T size={18} weight="bold" color="#fff">{c.name}</T>
                <Pressable hitSlop={10} onPress={() => navigation.navigate('CardForm', { id: c.id })}>
                  <Icon name="pencil-outline" size={20} color="rgba(255,255,255,0.9)" />
                </Pressable>
              </View>
              <Icon name="integrated-circuit-chip" size={30} color="rgba(255,255,255,0.75)" />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <T size={12} color="rgba(255,255,255,0.8)">Próxima fatura · vence {formatDate(invoiceDates(c, m).dueDate)}</T>
                  <T size={24} weight="extrabold" color="#fff">{formatMoney(inv?.total ?? 0)}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {available != null ? (
                    <>
                      <T size={12} color="rgba(255,255,255,0.8)">Limite restante</T>
                      <T size={15} weight="bold" color="#fff">{formatMoney(available)}</T>
                    </>
                  ) : null}
                  <T size={11.5} color="rgba(255,255,255,0.75)" align="right">Fecha dia {c.closing_day} · vence dia {c.due_day}</T>
                </View>
              </View>

              {c.limit_cents ? (
                <View style={{ gap: 6, marginTop: 12 }}>
                  <View style={styles.limitTrack}>
                    <View
                      style={[
                        styles.limitFill,
                        {
                          width: `${Math.min(100, Math.max(0, pctUsed))}%`,
                          backgroundColor: available != null && available < 0 ? colors.danger : '#fff',
                        },
                      ]}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T size={11.5} color="rgba(255,255,255,0.85)">
                      {formatMoney(used)} de {formatMoney(c.limit_cents)}
                    </T>
                    <T size={11.5} weight="semibold" color="#fff">{pctUsed}% usado</T>
                  </View>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      <Button title="Adicionar cartão" icon="plus" variant={cards.length ? 'secondary' : 'primary'} onPress={() => navigation.navigate('CardForm', {})} />
    </ScrollView>
  );
}

const CARD_COLORS = ['#7C3AED', '#1F6FEB', '#E8590C', '#0F9D58', '#C2185B', '#37474F', '#8A05BE', '#D4A017'];

export function CardFormScreen({ route, navigation }: RootProps<'CardForm'>) {
  const insets = useSafeAreaInsets();
  const { ledger, refresh } = useStore();
  const existing = route.params?.id ? ledger.card(route.params.id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? CARD_COLORS[ledger.snap.cards.length % CARD_COLORS.length]);
  const [closing, setClosing] = useState(existing?.closing_day ?? 1);
  const [due, setDue] = useState(existing?.due_day ?? 10);
  const [limit, setLimit] = useState(existing?.limit_cents ?? 0);

  useLayoutEffect(() => { navigation.setOptions({ title: existing ? 'Editar cartão' : 'Novo cartão' }); }, [navigation, existing]);

  const save = () => {
    if (!name.trim()) return Alert.alert('Informe o nome do cartão');
    db.saveCard({ id: existing?.id, name: name.trim(), color, closing_day: closing, due_day: due, limit_cents: limit || null });
    refresh();
    navigation.goBack();
  };

  const remove = () => {
    Alert.alert('Excluir cartão', 'Se houver lançamentos neste cartão, ele será apenas arquivado para manter o histórico.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => { db.deleteCard(existing!.id); refresh(); navigation.goBack(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.cardVisual, { backgroundColor: color, height: 150 }]}>
          <T size={18} weight="bold" color="#fff">{name || 'Nome do cartão'}</T>
          <T size={12.5} color="rgba(255,255,255,0.85)">Fecha dia {closing} · vence dia {due}</T>
        </View>
        <Field label="Nome">
          <Input value={name} onChangeText={setName} placeholder="Ex.: Nubank, Inter, Itaú" autoFocus={!existing} />
        </Field>
        <Field label="Cor">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CARD_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}>
                {color === c && <Icon name="check" size={18} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Dia de fechamento" hint="Compras feitas a partir deste dia entram na fatura seguinte.">
          <Stepper value={closing} onChange={setClosing} min={1} max={31} format={(v) => `Dia ${v}`} />
        </Field>
        <Field label="Dia de vencimento">
          <Stepper value={due} onChange={setDue} min={1} max={31} format={(v) => `Dia ${v}`} />
        </Field>
        <Field label="Limite (opcional)">
          <MoneyInput value={limit} onChange={setLimit} />
        </Field>
        {existing && <Button title="Excluir cartão" icon="trash-can-outline" variant="danger" onPress={remove} />}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: insets.bottom + 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <Button title="Salvar" icon="check" onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardVisual: { borderRadius: 20, padding: 18, minHeight: 190, justifyContent: 'space-between' },
  limitTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  limitFill: { height: '100%', borderRadius: 3 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: '#fff' },
});

