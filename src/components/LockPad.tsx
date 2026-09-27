import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme';
import { Button, Icon, Input, T, tap } from './ui';
import type { LockType } from '../data/lock';

/** Menor segredo aceito ao criar: PIN de 4 dígitos, senha de 4 caracteres, padrão de 4 pontos. */
export const MIN_SECRET = 4;

/**
 * Entrada do segredo no tipo escolhido. `pinLength` faz o PIN conferir sozinho ao chegar
 * no tamanho (desbloqueio); sem ele, aparece o botão de continuar (criação).
 */
export function SecretInput({ type, onSubmit, pinLength, error, extraKey, submitLabel = 'Continuar' }: {
  type: LockType;
  onSubmit: (secret: string) => void;
  pinLength?: number;
  error?: boolean;
  /** Tecla extra do PIN, no canto esquerdo (a digital). */
  extraKey?: { icon: string; onPress: () => void };
  submitLabel?: string;
}) {
  if (type === 'pin') return <PinPad onSubmit={onSubmit} length={pinLength} error={error} extraKey={extraKey} submitLabel={submitLabel} />;
  if (type === 'password') return <PasswordPad onSubmit={onSubmit} error={error} submitLabel={submitLabel} />;
  return <PatternPad onSubmit={onSubmit} error={error} />;
}

// ---------------------------------------------------------------- PIN
function PinPad({ onSubmit, length, error, extraKey, submitLabel }: {
  onSubmit: (s: string) => void; length?: number; error?: boolean; extraKey?: { icon: string; onPress: () => void }; submitLabel: string;
}) {
  const [digits, setDigits] = useState('');
  useEffect(() => { if (error) setDigits(''); }, [error]);

  const press = (d: string) => {
    tap();
    const next = (digits + d).slice(0, length ?? 8);
    setDigits(next);
    if (length && next.length === length) setTimeout(() => { onSubmit(next); setDigits(''); }, 80);
  };

  const slots = length ?? Math.max(MIN_SECRET, digits.length);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'extra', '0', 'del'];
  return (
    <View style={{ alignItems: 'center', gap: 28 }}>
      <View style={{ flexDirection: 'row', gap: 14, height: 18 }}>
        {Array.from({ length: slots }, (_, i) => (
          <View key={i} style={[styles.pinDot, i < digits.length && { backgroundColor: error ? colors.danger : colors.primary, borderColor: error ? colors.danger : colors.primary }]} />
        ))}
      </View>
      <View style={styles.keys}>
        {keys.map((k) => {
          if (k === 'extra') {
            return extraKey ? (
              <Pressable key={k} onPress={extraKey.onPress} style={styles.key}><Icon name={extraKey.icon} size={28} color={colors.primary} /></Pressable>
            ) : <View key={k} style={styles.key} />;
          }
          if (k === 'del') {
            return (
              <Pressable key={k} onPress={() => { tap(); setDigits(digits.slice(0, -1)); }} style={styles.key}>
                <Icon name="backspace-outline" size={26} color={colors.textSecondary} />
              </Pressable>
            );
          }
          return (
            <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [styles.key, styles.keyNum, pressed && { backgroundColor: colors.surface3 }]}>
              <T size={26} weight="semibold">{k}</T>
            </Pressable>
          );
        })}
      </View>
      {!length ? (
        <Button
          title={submitLabel}
          icon="check"
          disabled={digits.length < MIN_SECRET}
          onPress={() => { onSubmit(digits); setDigits(''); }}
          style={{ alignSelf: 'stretch' }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- senha
function PasswordPad({ onSubmit, error, submitLabel }: { onSubmit: (s: string) => void; error?: boolean; submitLabel: string }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => { if (error) setValue(''); }, [error]);
  const submit = () => { if (value.length >= MIN_SECRET) { onSubmit(value); setValue(''); } };
  return (
    <View style={{ gap: 14, alignSelf: 'stretch' }}>
      <View>
        <Input
          value={value}
          onChangeText={setValue}
          secureTextEntry={!show}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Senha"
          onSubmitEditing={submit}
          returnKeyType="done"
          style={[{ paddingRight: 52 }, error ? { borderColor: colors.danger, borderWidth: 1 } : null]}
        />
        <Pressable hitSlop={10} onPress={() => setShow(!show)} style={styles.eye}>
          <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
        </Pressable>
      </View>
      <Button title={submitLabel} icon="check" disabled={value.length < MIN_SECRET} onPress={submit} />
    </View>
  );
}

// ---------------------------------------------------------------- padrão 3x3
const GRID = 3;

/**
 * Padrão de 3x3 pontos desenhado com o dedo. Passar por cima de um ponto do meio sem
 * tocar nele inclui o ponto, como no desbloqueio do Android.
 */
function PatternPad({ onSubmit, error }: { onSubmit: (s: string) => void; error?: boolean }) {
  const SIZE = 280;
  const step = SIZE / GRID;
  const center = (i: number) => ({ x: (i % GRID) * step + step / 2, y: Math.floor(i / GRID) * step + step / 2 });
  const [seq, setSeq] = useState<number[]>([]);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const [showError, setShowError] = useState(false);
  const seqRef = useRef<number[]>([]);

  useEffect(() => {
    if (!error) return;
    setShowError(true);
    const t = setTimeout(() => { setShowError(false); setSeq([]); seqRef.current = []; }, 700);
    return () => clearTimeout(t);
  }, [error]);

  const hit = (x: number, y: number) => {
    for (let i = 0; i < GRID * GRID; i++) {
      const c = center(i);
      if (Math.hypot(c.x - x, c.y - y) < step * 0.34) return i;
    }
    return -1;
  };

  const add = (i: number) => {
    const cur = seqRef.current;
    if (i < 0 || cur.includes(i)) return;
    const prev = cur[cur.length - 1];
    const next = [...cur];
    if (prev != null) {
      // ponto do meio pulado entra junto
      const r1 = Math.floor(prev / GRID), c1 = prev % GRID, r2 = Math.floor(i / GRID), c2 = i % GRID;
      if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) {
        const mid = ((r1 + r2) / 2) * GRID + (c1 + c2) / 2;
        if (!next.includes(mid)) next.push(mid);
      }
    }
    next.push(i);
    seqRef.current = next;
    setSeq(next);
    Haptics.selectionAsync().catch(() => {});
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        seqRef.current = [];
        setSeq([]);
        setShowError(false);
        const { locationX: x, locationY: y } = e.nativeEvent;
        setFinger({ x, y });
        add(hit(x, y));
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setFinger({ x, y });
        add(hit(x, y));
      },
      onPanResponderRelease: () => {
        setFinger(null);
        const s = seqRef.current;
        if (s.length) onSubmitRef.current(s.join(''));
        // o traço some um instante depois, a não ser que venha erro
        setTimeout(() => { if (!errorRef.current) { seqRef.current = []; setSeq([]); } }, 250);
      },
    }),
  ).current;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const errorRef = useRef(error);
  errorRef.current = error;

  const color = showError ? colors.danger : colors.primary;
  const last = seq.length ? center(seq[seq.length - 1]) : null;
  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ width: SIZE, height: SIZE }} {...responder.panHandlers}>
        <Svg width={SIZE} height={SIZE} pointerEvents="none">
          {seq.slice(1).map((p, k) => {
            const a = center(seq[k]);
            const b = center(p);
            return <Line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.8} />;
          })}
          {last && finger ? (
            <Line x1={last.x} y1={last.y} x2={finger.x} y2={finger.y} stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.45} />
          ) : null}
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const c = center(i);
            const on = seq.includes(i);
            return (
              <React.Fragment key={i}>
                {on ? <Circle cx={c.x} cy={c.y} r={22} fill={color} opacity={0.18} /> : null}
                <Circle cx={c.x} cy={c.y} r={on ? 9 : 7} fill={on ? color : colors.muted} />
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
      <T size={12.5} color={colors.muted}>Ligue pelo menos {MIN_SECRET} pontos</T>
    </View>
  );
}

const styles = StyleSheet.create({
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.muted },
  keys: { width: 288, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  key: { width: 84, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36 },
  keyNum: { backgroundColor: colors.surface },
  eye: { position: 'absolute', right: 14, top: 14 },
});
