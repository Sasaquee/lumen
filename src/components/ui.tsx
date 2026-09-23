import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius } from '../theme';
import { addMonths, monthLabel } from '../utils/dates';
import { formatMoney } from '../utils/money';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const tap = () => Haptics.selectionAsync().catch(() => {});

type TProps = TextProps & {
  size?: number;
  weight?: keyof typeof font;
  color?: string;
  align?: TextStyle['textAlign'];
};

export function T({ size = 15, weight = 'regular', color = colors.text, align, style, ...rest }: TProps) {
  return <Text {...rest} style={[{ fontSize: size, fontFamily: font[weight], color, textAlign: align }, style]} />;
}

export function Icon({ name, size = 20, color = colors.text }: { name: string; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} />;
}

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: 16 }, style]}>{children}</View>;
}

export function SectionTitle({ title, right, style }: { title: string; right?: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <T size={13} weight="semibold" color={colors.textSecondary} style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</T>
      {right}
    </View>
  );
}

export function Button({
  title, onPress, variant = 'primary', icon, disabled, loading, style,
}: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = { primary: colors.primary, secondary: colors.surface2, danger: colors.dangerSoft, ghost: 'transparent' }[variant];
  const fg = { primary: '#062414', secondary: colors.text, danger: colors.danger, ghost: colors.primary }[variant];
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Icon name={icon} size={20} color={fg} />}
          <T size={16} weight="semibold" color={fg}>{title}</T>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color = colors.text, bg = colors.surface2, size = 40 }: {
  icon: string; onPress: () => void; color?: string; bg?: string; size?: number;
}) {
  return (
    <Pressable
      hitSlop={6}
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name={icon} size={size * 0.52} color={color} />
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange, style }: {
  options: { value: V; label: string; color?: string }[]; value: V; onChange: (v: V) => void; style?: ViewStyle;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => { tap(); onChange(o.value); }}
            style={[styles.segment, active && { backgroundColor: colors.surface3 }]}
          >
            <T size={14} weight={active ? 'semibold' : 'medium'} color={active ? (o.color ?? colors.text) : colors.muted}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, icon, active, color = colors.primary, onPress }: {
  label: string; icon?: string; active?: boolean; color?: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      style={[styles.chip, active && { borderColor: color, backgroundColor: color + '22' }]}
    >
      {icon && <Icon name={icon} size={16} color={active ? color : colors.textSecondary} />}
      <T size={13.5} weight={active ? 'semibold' : 'medium'} color={active ? colors.text : colors.textSecondary}>{label}</T>
    </Pressable>
  );
}

export function CategoryIcon({ icon, color, size = 40 }: { icon?: string; color?: string; size?: number }) {
  const c = color ?? colors.muted;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: c + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon ?? 'tag-outline'} size={size * 0.52} color={c} />
    </View>
  );
}

export function MonthSwitcher({ month, onChange, hint, style }: {
  month: string; onChange: (m: string) => void; hint?: string; style?: ViewStyle;
}) {
  return (
    <View style={[styles.monthSwitcher, hint ? { height: undefined, paddingVertical: 6 } : null, style]}>
      <IconButton icon="chevron-left" onPress={() => onChange(addMonths(month, -1))} size={36} bg="transparent" />
      <View style={{ minWidth: 150 }}>
        <T size={16} weight="semibold" align="center">{monthLabel(month)}</T>
        {hint ? <T size={11.5} color={colors.muted} align="center">{hint}</T> : null}
      </View>
      <IconButton icon="chevron-right" onPress={() => onChange(addMonths(month, 1))} size={36} bg="transparent" />
    </View>
  );
}

export function Field({ label, children, hint, style }: { label: string; children: React.ReactNode; hint?: string; style?: ViewStyle }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <T size={13} weight="medium" color={colors.textSecondary}>{label}</T>
      {children}
      {hint ? <T size={12.5} color={colors.muted}>{hint}</T> : null}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.primary}
      cursorColor={colors.primary}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

/** Entrada de dinheiro com máscara de centavos. */
export function MoneyInput({ value, onChange, color = colors.text, autoFocus, big }: {
  value: number; onChange: (cents: number) => void; color?: string; autoFocus?: boolean; big?: boolean;
}) {
  return (
    <TextInput
      value={value ? formatMoney(value) : ''}
      placeholder="R$ 0,00"
      placeholderTextColor={colors.muted}
      keyboardType="number-pad"
      autoFocus={autoFocus}
      selectionColor={colors.primary}
      cursorColor={colors.primary}
      onChangeText={(t) => {
        const digits = t.replace(/\D/g, '').slice(0, 11);
        onChange(digits ? parseInt(digits, 10) : 0);
      }}
      style={big
        ? { fontSize: 38, fontFamily: font.bold, color, paddingVertical: 4, textAlign: 'center' }
        : [styles.input, { color }]}
    />
  );
}

export function Stepper({ value, onChange, min = 1, max = 99, format }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; format?: (v: number) => string;
}) {
  return (
    <View style={styles.stepper}>
      <IconButton icon="minus" onPress={() => onChange(Math.max(min, value - 1))} size={40} />
      <T size={18} weight="semibold" style={{ minWidth: 90 }} align="center">{format ? format(value) : value}</T>
      <IconButton icon="plus" onPress={() => onChange(Math.min(max, value + 1))} size={40} />
    </View>
  );
}

export function ProgressBar({ value, color = colors.primary, height = 8, track = colors.surface3 }: {
  value: number; color?: string; height?: number; track?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

export function Checkbox({ checked, onPress, color = colors.primary }: { checked: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      hitSlop={10}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); }}
      style={[styles.checkbox, checked && { backgroundColor: color, borderColor: color }]}
    >
      {checked && <Icon name="check-bold" size={16} color="#062414" />}
    </Pressable>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={30} color={colors.muted} />
      </View>
      <T size={16} weight="semibold" align="center">{title}</T>
      {text ? <T size={14} color={colors.muted} align="center">{text}</T> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Sheet({ visible, onClose, children, title }: { visible: boolean; onClose: () => void; children: React.ReactNode; title?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        {title ? <T size={17} weight="bold" style={{ marginBottom: 10, paddingHorizontal: 4 }}>{title}</T> : null}
        {children}
      </View>
    </Modal>
  );
}

export function SheetAction({ icon, label, onPress, color = colors.text }: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={({ pressed }) => [styles.sheetAction, pressed && { backgroundColor: colors.surface2 }]}>
      <Icon name={icon} size={22} color={color} />
      <T size={15.5} weight="medium" color={color}>{label}</T>
    </Pressable>
  );
}

export function ListRow({ icon, iconColor, title, subtitle, right, onPress, onLongPress }: {
  icon?: string; iconColor?: string; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.surface2 }]}>
      {icon ? <CategoryIcon icon={icon} color={iconColor} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15} weight="medium" numberOfLines={1}>{title}</T>
        {subtitle ? <T size={12.5} color={colors.muted} numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </Pressable>
  );
}

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 68 }} />;

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 4 },
  button: { height: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  segment: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  monthSwitcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 24, paddingHorizontal: 4, height: 46, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, color: colors.text, fontFamily: font.regular, fontSize: 16, paddingHorizontal: 14, height: 50 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, padding: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 12, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surface3, marginBottom: 12 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, height: 52, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
});
