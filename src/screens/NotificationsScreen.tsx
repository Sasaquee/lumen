import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { colors } from '../theme';
import { Button, Card, Checkbox, Divider, Icon, SectionTitle, Stepper, T, tap } from '../components/ui';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import {
  askPermission, buildReminders, hasPermission, notifSettings, offsetLabel, OFFSETS,
  saveNotifSettings, sendTest, syncReminders,
} from '../data/notifications';
import { formatDateLong } from '../utils/dates';

export default function NotificationsScreen({ navigation }: RootProps<'Notifications'>) {
  const { ledger, refresh } = useStore();
  const s = notifSettings(ledger);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { hasPermission().then(setGranted).catch(() => setGranted(false)); }, []);

  const preview = s.enabled ? buildReminders(ledger) : [];

  const apply = async (patch: Parameters<typeof saveNotifSettings>[0]) => {
    saveNotifSettings(patch);
    refresh();
  };

  const toggle = async (on: boolean) => {
    tap();
    if (!on) { await apply({ enabled: false }); setGranted(await hasPermission()); return; }
    setBusy(true);
    try {
      const ok = await askPermission();
      setGranted(ok);
      if (!ok) {
        Alert.alert(
          'Permissão necessária',
          'O Android precisa da sua autorização para mostrar os lembretes. Abra as configurações do app e ative as notificações.',
          [{ text: 'Agora não', style: 'cancel' }, { text: 'Abrir configurações', onPress: () => Linking.openSettings() }],
        );
        return;
      }
      await apply({ enabled: true });
    } finally {
      setBusy(false);
    }
  };

  const toggleOffset = (d: number) => {
    tap();
    const next = s.offsets.includes(d) ? s.offsets.filter((o) => o !== d) : [...s.offsets, d];
    if (next.length === 0) return; // pelo menos um aviso
    apply({ offsets: next.sort((a, b) => b - a) });
  };

  const test = async () => {
    if (!(await askPermission())) {
      Alert.alert('Permissão necessária', 'Ative as notificações para testar.');
      return;
    }
    await sendTest();
    Alert.alert('Enviado', 'O aviso de teste chega em alguns segundos. Pode fechar o app.');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
      <View style={styles.intro}>
        <Icon name="bell-ring-outline" size={20} color={colors.primary} />
        <T size={13.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>
          Um aviso por dia, curto: quando várias contas caem juntas no fim do ciclo, elas entram no
          mesmo aviso. O detalhe fica na central, dentro do app. Nada sai daqui.
        </T>
      </View>

      <Card style={{ gap: 4 }}>
        <View style={styles.row}>
          <Icon name={s.enabled ? 'bell' : 'bell-off-outline'} size={22} color={s.enabled ? colors.primary : colors.muted} />
          <View style={{ flex: 1 }}>
            <T size={15.5} weight="medium">Lembretes de vencimento</T>
            <T size={12.5} color={colors.muted}>
              {granted === false ? 'Sem permissão do sistema' : s.enabled ? 'Ativados' : 'Desativados'}
            </T>
          </View>
          <Switch
            value={s.enabled}
            disabled={busy}
            onValueChange={toggle}
            trackColor={{ true: colors.primaryDark, false: colors.surface3 }}
            thumbColor={s.enabled ? colors.primary : colors.muted}
          />
        </View>
      </Card>

      {s.enabled ? (
        <>
          <View>
            <SectionTitle title="Quando avisar" style={{ marginTop: 0 }} />
            <Card padded={false} style={{ paddingVertical: 4 }}>
              {OFFSETS.map((d, i) => (
                <View key={d}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.optRow}>
                    <Icon name="calendar-clock-outline" size={20} color={colors.textSecondary} />
                    <T size={15} style={{ flex: 1 }}>{offsetLabel(d)}</T>
                    <Checkbox checked={s.offsets.includes(d)} onPress={() => toggleOffset(d)} />
                  </View>
                </View>
              ))}
            </Card>
            <T size={12.5} color={colors.muted} style={{ paddingHorizontal: 6, marginTop: 8 }}>
              Pelo menos um aviso precisa ficar marcado.
            </T>
          </View>

          <View>
            <SectionTitle title="Horário do aviso" style={{ marginTop: 0 }} />
            <Stepper
              value={s.hour}
              onChange={(h) => apply({ hour: h })}
              min={0}
              max={23}
              format={(v) => `${String(v).padStart(2, '0')}:00`}
            />
          </View>

          <View>
            <SectionTitle title="Próximos avisos" right={<T size={13} color={colors.textSecondary}>{preview.length}</T>} style={{ marginTop: 0 }} />
            <Card padded={false} style={{ paddingVertical: 4 }}>
              {preview.length === 0 ? (
                <View style={{ padding: 16 }}>
                  <T size={13.5} color={colors.muted} align="center">
                    Nenhum aviso programado — não há contas em aberto nos próximos vencimentos.
                  </T>
                </View>
              ) : preview.slice(0, 8).map((r, i) => (
                <View key={`${r.title}-${r.when.getTime()}`}>
                  {i > 0 ? <Divider /> : null}
                  <View style={styles.optRow}>
                    <Icon name="bell-outline" size={18} color={colors.primary} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T size={14} weight="medium">{r.title}</T>
                      <T size={12} color={colors.muted} numberOfLines={2}>{r.body}</T>
                    </View>
                    <T size={12} color={colors.textSecondary}>
                      {formatDateLong(r.when.toISOString().slice(0, 10)).slice(0, 5)}
                    </T>
                  </View>
                </View>
              ))}
            </Card>
            {preview.length > 8 ? (
              <T size={12.5} color={colors.muted} align="center" style={{ marginTop: 8 }}>
                e mais {preview.length - 8}
              </T>
            ) : null}
          </View>

          <Button
            title="Abrir a central de avisos"
            icon="bell-ring-outline"
            onPress={() => navigation.navigate('NotificationCenter')}
          />
          <Button title="Enviar um aviso de teste" icon="bell-check-outline" variant="secondary" onPress={test} />
          <Button
            title="Reprogramar agora"
            icon="refresh"
            variant="ghost"
            onPress={async () => { const n = await syncReminders(ledger); Alert.alert('Pronto', `${n} avisos programados.`); }}
          />
        </>
      ) : null}

      <View style={styles.note}>
        <Icon name="battery-alert-variant-outline" size={18} color={colors.muted} />
        <T size={12.5} color={colors.muted} style={{ flex: 1, lineHeight: 18 }}>
          Alguns celulares Samsung suspendem apps em segundo plano e atrasam avisos. Se isso acontecer, em
          Configurações do Android → Bateria, marque o Lumen como "Sem restrições".
        </T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 },
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
});
