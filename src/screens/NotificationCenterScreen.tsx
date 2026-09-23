import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Button, Card, Divider, EmptyState, Icon, SectionTitle, T } from '../components/ui';
import { ItemRow } from '../components/ItemRow';
import type { RootProps } from '../navigation/types';
import { useStore } from '../data/store';
import { buildReminders, notificationCenter, notifSettings, type AlertTone, type Due } from '../data/reminders';
import { formatDate, formatDateLong, today } from '../utils/dates';
import { formatMoney } from '../utils/money';

const toneColor: Record<AlertTone, string> = {
  danger: colors.danger,
  warning: colors.warning,
  normal: colors.textSecondary,
};

export default function NotificationCenterScreen({ navigation }: RootProps<'NotificationCenter'>) {
  const { ledger, month } = useStore();
  const groups = useMemo(() => notificationCenter(ledger), [ledger]);
  const notif = notifSettings(ledger);
  const next = useMemo(() => (notif.enabled ? buildReminders(ledger)[0] : undefined), [ledger, notif.enabled]);

  const total = groups.reduce((s, g) => s + g.total, 0);
  const count = groups.reduce((s, g) => s + g.dues.length, 0);
  const urgent = groups.filter((g) => g.tone === 'danger').reduce((s, g) => s + g.dues.length, 0);

  /** A fatura já tem representação de item, então tudo na central usa a mesma linha. */
  const rowFor = (d: Due) => (d.invoice ? ledger.invoiceItem(d.invoice) : d.item!);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card style={{ padding: 20, gap: 4 }}>
        <T size={13.5} color={colors.textSecondary}>Em aberto</T>
        <T size={32} weight="extrabold" style={{ letterSpacing: -1 }} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(total)}
        </T>
        <T size={13} color={colors.muted}>
          {count} {count === 1 ? 'conta' : 'contas'}
          {urgent > 0 ? ` · ${urgent} ${urgent === 1 ? 'urgente' : 'urgentes'}` : ''}
        </T>
        {next ? (
          <View style={styles.next}>
            <Icon name="bell-outline" size={18} color={colors.primary} />
            <T size={12.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
              Próximo aviso em {formatDateLong(next.when.toISOString().slice(0, 10))} às{' '}
              {String(notif.hour).padStart(2, '0')}:00 — {next.title}
            </T>
          </View>
        ) : (
          <View style={styles.next}>
            <Icon name="bell-off-outline" size={18} color={colors.muted} />
            <T size={12.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
              {notif.enabled ? 'Nenhum aviso programado.' : 'Os lembretes estão desativados.'}
            </T>
          </View>
        )}
      </Card>

      {groups.length === 0 ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState icon="check-all" title="Nada pendente" text="Nenhuma conta em aberto para avisar." />
        </Card>
      ) : null}

      {groups.map((g) => (
        <View key={g.key}>
          <SectionTitle
            title={g.label}
            right={<T size={13} color={toneColor[g.tone]}>{formatMoney(g.total)}</T>}
          />
          <Card
            padded={false}
            style={{ paddingVertical: 4, borderColor: g.tone === 'danger' ? 'rgba(242,109,109,0.3)' : colors.border }}
          >
            {g.dues.map((d, i) => (
              <View key={d.key}>
                {i > 0 ? <Divider /> : null}
                <ItemRow item={rowFor(d)} month={month} />
                {g.key !== 'today' ? (
                  <T size={11.5} color={d.date < today() ? colors.danger : colors.muted} style={styles.when}>
                    {d.date < today() ? 'Venceu' : 'Vence'} {formatDate(d.date)}
                  </T>
                ) : null}
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Button
        style={{ marginTop: 20 }}
        variant="secondary"
        icon="cog-outline"
        title="Ajustar os lembretes"
        onPress={() => navigation.navigate('Notifications')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  next: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginTop: 12 },
  when: { paddingLeft: 68, paddingBottom: 8, marginTop: -6 },
});
