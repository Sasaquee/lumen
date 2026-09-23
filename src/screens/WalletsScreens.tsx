import React, { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, palette } from '../theme';
import { Button, Card, EmptyState, Field, Icon, Input, ProgressBar, T } from '../components/ui';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { currentMonth } from '../utils/dates';
import { formatMoney } from '../utils/money';

/** Os benefícios mais comuns, para não fazer ninguém digitar tudo do zero. */
const PRESETS: { name: string; icon: string; color: string }[] = [
  { name: 'Vale refeição', icon: 'silverware-fork-knife', color: '#2FA84F' },
  { name: 'Vale alimentação', icon: 'cart-outline', color: '#3987E5' },
  { name: 'Vale combustível', icon: 'gas-station-outline', color: '#D95926' },
  { name: 'Vale cultura', icon: 'ticket-outline', color: '#9085E9' },
  { name: 'Auxílio home office', icon: 'home-city-outline', color: '#4FB6C9' },
];

const ICONS = [
  'silverware-fork-knife', 'cart-outline', 'gas-station-outline', 'ticket-outline',
  'home-city-outline', 'food-apple-outline', 'coffee-outline', 'wallet-outline',
];

export function WalletsScreen({ navigation }: RootProps<'Wallets'>) {
  const { ledger } = useStore();
  const wallets = ledger.wallets;
  const cycle = currentMonth();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      {wallets.length === 0 && (
        <Card>
          <EmptyState
            icon="silverware-fork-knife"
            title="Nenhum vale"
            text="Vale refeição, alimentação, combustível... Cadastre quantos você tiver: cada um tem o saldo próprio e não se mistura com o caixa."
          />
        </Card>
      )}

      {wallets.map((w) => {
        const s = ledger.walletSummary(w.id, cycle);
        const used = s ? s.spent : 0;
        const pct = s && s.total > 0 ? used / s.total : 0;
        return (
          <Pressable key={w.id} onPress={() => navigation.navigate('WalletForm', { id: w.id })}>
            <View style={[styles.visual, { backgroundColor: w.color }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name={w.icon} size={22} color="#fff" />
                <T size={18} weight="bold" color="#fff" style={{ flex: 1 }}>{w.name}</T>
                <Icon name="pencil-outline" size={20} color="rgba(255,255,255,0.9)" />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <T size={12} color="rgba(255,255,255,0.8)">Restante</T>
                  <T size={24} weight="extrabold" color="#fff">{formatMoney(s?.left ?? 0)}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T size={12} color="rgba(255,255,255,0.8)">Limite total</T>
                  <T size={15} weight="bold" color="#fff">{formatMoney(s?.total ?? 0)}</T>
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct * 100))}%` }]} />
                </View>
                <T size={11.5} color="rgba(255,255,255,0.85)">
                  {formatMoney(used)} usados neste mês
                </T>
              </View>
            </View>
          </Pressable>
        );
      })}

      <Button variant="secondary" icon="plus" title="Adicionar vale" onPress={() => navigation.navigate('WalletForm', {})} />

      <View style={styles.hint}>
        <Icon name="information-outline" size={18} color={colors.primary} />
        <T size={13} color={colors.textSecondary} style={{ flex: 1, lineHeight: 19 }}>
          O crédito mensal se cadastra como receita fixa, escolhendo o vale em "Onde cai". O limite total é
          o que sobrou do mês anterior mais o crédito que entrou agora.
        </T>
      </View>
    </ScrollView>
  );
}

export function WalletFormScreen({ route, navigation }: RootProps<'WalletForm'>) {
  const { ledger, refresh } = useStore();
  const existing = route.params?.id ? ledger.wallet(route.params.id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? PRESETS[0].icon);
  const [color, setColor] = useState(existing?.color ?? PRESETS[0].color);

  useLayoutEffect(() => {
    navigation.setOptions({ title: existing ? 'Editar vale' : 'Novo vale' });
  }, [navigation, existing]);

  const save = () => {
    if (!name.trim()) return Alert.alert('Informe o nome do vale');
    db.saveWallet({ id: existing?.id, name: name.trim(), icon, color });
    refresh();
    navigation.goBack();
  };

  const remove = () => {
    Alert.alert('Excluir vale', 'Se houver lançamentos neste vale, ele será apenas arquivado para manter o histórico.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => { db.deleteWallet(existing!.id); refresh(); navigation.goBack(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.visual, { backgroundColor: color, minHeight: 120, justifyContent: 'center' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={icon} size={24} color="#fff" />
            <T size={18} weight="bold" color="#fff">{name || 'Nome do vale'}</T>
          </View>
        </View>

        {!existing && (
          <Field label="Comece por um pronto" hint="Só um atalho: dá para renomear depois.">
            <View style={styles.wrap}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.name}
                  onPress={() => { setName(p.name); setIcon(p.icon); setColor(p.color); }}
                  style={[styles.preset, name === p.name && { borderColor: p.color }]}
                >
                  <Icon name={p.icon} size={16} color={p.color} />
                  <T size={13.5}>{p.name}</T>
                </Pressable>
              ))}
            </View>
          </Field>
        )}

        <Field label="Nome">
          <Input value={name} onChangeText={setName} placeholder="Ex.: Vale refeição, Caju, Flash" autoFocus={!existing} />
        </Field>

        <Field label="Ícone">
          <View style={styles.wrap}>
            {ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={[styles.iconBtn, icon === i && { borderColor: color, backgroundColor: colors.surface2 }]}>
                <Icon name={i} size={20} color={icon === i ? color : colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Cor">
          <View style={styles.wrap}>
            {palette.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}>
                {color === c ? <Icon name="check" size={18} color="#fff" /> : null}
              </Pressable>
            ))}
          </View>
        </Field>

        <Button title={existing ? 'Salvar alterações' : 'Adicionar vale'} icon="check" onPress={save} />
        {existing ? <Button title="Excluir vale" icon="trash-can-outline" variant="danger" onPress={remove} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  visual: { borderRadius: 20, padding: 18, minHeight: 170, justifyContent: 'space-between', gap: 14 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#fff' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  preset: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: '#fff' },
  hint: { flexDirection: 'row', gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, marginTop: 4 },
});
