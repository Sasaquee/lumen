import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Button, Icon, MoneyInput, Sheet, T } from './ui';
import { monthShort } from '../utils/dates';
import { formatMoney } from '../utils/money';

/**
 * Lista de parcelas com valor próprio. Tocar numa parcela abre o editor, que pode
 * aplicar o valor só nela ou nela e nas seguintes — o jeito rápido de montar um
 * financiamento em que a parcela muda no meio do contrato.
 */
export function ParcelEditor({ values, onChange, labelOf, dimBefore = 0 }: {
  values: number[];
  onChange: (v: number[]) => void;
  /** Mês (YYYY-MM) em que a parcela `i` cai, para o rótulo. */
  labelOf: (i: number) => string;
  /** Parcelas antes desta ficam apagadas: já tinham passado quando a compra entrou no app. */
  dimBefore?: number;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState(0);
  const distinct = new Set(values).size;

  const open = (i: number) => { setDraft(values[i]); setEditing(i); };
  const apply = (following: boolean) => {
    if (editing == null) return;
    onChange(values.map((v, i) => (i === editing || (following && i > editing) ? draft : v)));
    setEditing(null);
  };

  return (
    <View style={styles.box}>
      {values.map((v, i) => (
        <Pressable
          key={i}
          onPress={() => open(i)}
          style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { backgroundColor: colors.surface2 }, i < dimBefore && { opacity: 0.45 }]}
        >
          <T size={13} color={colors.muted} style={{ width: 34 }}>{i + 1}ª</T>
          <T size={14} color={colors.textSecondary} style={{ flex: 1 }}>
            {monthShort(labelOf(i), true)}{i < dimBefore ? ' · antes do app' : ''}
          </T>
          <T size={15} weight="semibold">{formatMoney(v)}</T>
          <Icon name="pencil-outline" size={16} color={colors.muted} />
        </Pressable>
      ))}
      <T size={12} color={colors.muted} style={{ padding: 10 }}>
        {distinct === 1 ? 'Todas iguais. ' : `${distinct} valores diferentes. `}Toque numa parcela para mudar o valor.
      </T>

      <Sheet visible={editing != null} onClose={() => setEditing(null)} title={editing != null ? `${editing + 1}ª parcela · ${monthShort(labelOf(editing), true)}` : ''}>
        <View style={{ paddingHorizontal: 8, gap: 12 }}>
          <MoneyInput value={draft} onChange={setDraft} autoFocus big />
          <Button title="Só esta parcela" icon="check" onPress={() => apply(false)} />
          {editing != null && editing < values.length - 1 ? (
            <Button title={`Esta e as ${values.length - 1 - editing} seguintes`} icon="arrow-collapse-down" variant="secondary" onPress={() => apply(true)} />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 46 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
