import React, { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, palette } from '../theme';
import { Button, Card, CategoryIcon, Divider, Field, Icon, Input, ListRow, Segmented, T } from '../components/ui';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import * as db from '../data/db';
import type { Kind } from '../data/types';

export function CategoriesScreen({ navigation }: RootProps<'Categories'>) {
  const { ledger } = useStore();
  const [kind, setKind] = useState<Kind>('expense');
  const list = ledger.snap.categories.filter((c) => c.kind === kind && !c.archived);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Receitas' }]} />
      <Card padded={false} style={{ marginTop: 14, paddingVertical: 4 }}>
        {list.map((c, idx) => (
          <View key={c.id}>
            {idx > 0 && <Divider />}
            <ListRow icon={c.icon} iconColor={c.color} title={c.name} onPress={() => navigation.navigate('CategoryForm', { id: c.id })}
              right={<Icon name="chevron-right" color={colors.muted} />} />
          </View>
        ))}
      </Card>
      <Button title="Nova categoria" icon="plus" variant="secondary" style={{ marginTop: 14 }} onPress={() => navigation.navigate('CategoryForm', { kind })} />
    </ScrollView>
  );
}

const ICONS = [
  'home-outline', 'food-outline', 'cart-outline', 'car-outline', 'bus', 'gas-station-outline', 'heart-pulse', 'pill',
  'school-outline', 'book-open-variant', 'gamepad-variant-outline', 'movie-open-outline', 'music-note-outline', 'play-box-multiple-outline',
  'flash-outline', 'water-outline', 'wifi', 'cellphone', 'shopping-outline', 'tshirt-crew-outline', 'paw-outline', 'baby-face-outline',
  'dumbbell', 'airplane', 'gift-outline', 'hand-heart-outline', 'bank-outline', 'shield-check-outline', 'hammer-wrench', 'coffee-outline',
  'glass-cocktail', 'content-cut', 'briefcase-outline', 'laptop', 'chart-line', 'cash-plus', 'piggy-bank-outline', 'receipt-text-outline',
  'dots-horizontal-circle-outline', 'tag-outline',
];

export function CategoryFormScreen({ route, navigation }: RootProps<'CategoryForm'>) {
  const insets = useSafeAreaInsets();
  const { ledger, refresh } = useStore();
  const existing = route.params?.id ? ledger.category(route.params.id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<Kind>(existing?.kind ?? route.params?.kind ?? 'expense');
  const [icon, setIcon] = useState(existing?.icon ?? 'tag-outline');
  const [color, setColor] = useState(existing?.color ?? palette[ledger.snap.categories.length % palette.length]);

  useLayoutEffect(() => { navigation.setOptions({ title: existing ? 'Editar categoria' : 'Nova categoria' }); }, [navigation, existing]);

  const save = () => {
    if (!name.trim()) return Alert.alert('Informe o nome da categoria');
    db.saveCategory({ id: existing?.id, name: name.trim(), kind, icon, color });
    refresh();
    navigation.goBack();
  };

  const remove = () => {
    Alert.alert('Excluir categoria', `Excluir "${existing!.name}"? Lançamentos antigos mantêm a categoria no histórico.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => { db.deleteCategory(existing!.id); refresh(); navigation.goBack(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10 }}>
          <CategoryIcon icon={icon} color={color} size={72} />
          <T size={17} weight="semibold">{name || 'Nome da categoria'}</T>
        </View>
        {!existing && (
          <Segmented value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }]} />
        )}
        <Field label="Nome">
          <Input value={name} onChangeText={setName} placeholder="Ex.: Academia" autoFocus={!existing} />
        </Field>
        <Field label="Cor">
          <View style={styles.grid}>
            {palette.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}>
                {color === c && <Icon name="check" size={18} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Ícone">
          <View style={styles.grid}>
            {ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={[styles.iconCell, icon === i && { borderColor: color, backgroundColor: color + '26' }]}>
                <Icon name={i} size={22} color={icon === i ? color : colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </Field>
        {existing && <Button title="Excluir categoria" icon="trash-can-outline" variant="danger" onPress={remove} />}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: insets.bottom + 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <Button title="Salvar" icon="check" onPress={save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: '#fff' },
  iconCell: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
});

