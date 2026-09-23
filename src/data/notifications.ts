import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Ledger } from './engine';
import * as db from './db';
import { NOTIF_ENABLED, NOTIF_HOUR, NOTIF_OFFSETS } from './types';
import { buildReminders, notifSettings } from './reminders';
import { formatDate, toISODate } from '../utils/dates';

const CHANNEL = 'vencimentos';

export { buildReminders, notifSettings, offsetLabel, OFFSETS } from './reminders';

export function saveNotifSettings(s: { enabled?: boolean; hour?: number; offsets?: number[] }) {
  if (s.enabled !== undefined) db.setSetting(NOTIF_ENABLED, s.enabled ? '1' : '0');
  if (s.hour !== undefined) db.setSetting(NOTIF_HOUR, String(s.hour));
  if (s.offsets !== undefined) db.setSetting(NOTIF_OFFSETS, s.offsets.join(','));
}

/** O canal precisa existir antes de qualquer notificação no Android. */
export async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Vencimentos',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3BE08F',
  });
}

export async function hasPermission() {
  const s = await Notifications.getPermissionsAsync();
  return s.granted;
}

/** Pede a permissão; no Android 13+ abre o diálogo do sistema. */
export async function askPermission() {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Reprograma tudo do zero: é barato e evita avisar de conta já paga. */
export async function syncReminders(ledger: Ledger) {
  const { enabled } = notifSettings(ledger);
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return 0;
  }
  if (!(await hasPermission())) return 0;

  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const reminders = buildReminders(ledger);
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.when, channelId: CHANNEL },
    });
  }
  return reminders.length;
}

export async function scheduledCount() {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

/** Dispara um aviso de teste daqui a alguns segundos. */
export async function sendTest() {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Lumen · teste de lembrete',
      body: `É assim que você vai ser avisado dos vencimentos. Hoje é ${formatDate(toISODate(new Date()))}.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 5000),
      channelId: CHANNEL,
    },
  });
}
