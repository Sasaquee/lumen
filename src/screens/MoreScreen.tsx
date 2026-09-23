import React, { useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { colors } from '../theme';
import { Card, Divider, Icon, ListRow, SectionTitle, T } from '../components/ui';
import { useStore } from '../data/store';
import * as db from '../data/db';
import { notifSettings } from '../data/notifications';
import { today } from '../utils/dates';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { ledger, refresh } = useStore();
  const [busy, setBusy] = useState(false);
  const s = ledger.snap;

  const exportBackup = async () => {
    try {
      setBusy(true);
      const file = new File(Paths.cache, `lumen-backup-${today()}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(db.exportData(), null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Salvar backup do Lumen' });
    } catch (e: any) {
      Alert.alert('Erro ao exportar', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await new File(res.assets[0].uri).text();
      const data = JSON.parse(text);
      const count = (data.entries?.length ?? 0) + (data.recurrings?.length ?? 0);
      Alert.alert('Restaurar backup', `O backup tem ${count} lançamentos. Isso SUBSTITUI todos os dados atuais do app.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar', style: 'destructive', onPress: () => {
            try { db.importData(data); refresh(); Alert.alert('Pronto', 'Backup restaurado.'); } catch (e: any) { Alert.alert('Erro', String(e?.message ?? e)); }
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('Erro ao importar', 'Não foi possível ler o arquivo. Verifique se é um backup do Lumen.');
    }
  };

  const wipe = () => {
    Alert.alert('Apagar todos os dados', 'Todos os lançamentos, cartões e categorias serão apagados deste aparelho. Recomendo exportar um backup antes.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar tudo', style: 'destructive', onPress: () => { db.wipeAll(); refresh(); } },
    ]);
  };

  const chevron = <Icon name="chevron-right" color={colors.muted} />;
  const cycleSubtitle = `Começa no dia ${ledger.cycleStartDay} · agora ${ledger.cycleRange(ledger.currentCycle())}`;
  const notif = notifSettings(ledger);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 120 }}>
      <T size={24} weight="extrabold" style={{ letterSpacing: -0.5, paddingHorizontal: 2 }}>Mais</T>

      <SectionTitle title="Cadastros" />
      <Card padded={false} style={{ paddingVertical: 4 }}>
        <ListRow icon="credit-card-outline" iconColor="#9085E9" title="Cartões de crédito" subtitle={`${s.cards.filter((c) => !c.archived).length} cadastrados`} right={chevron} onPress={() => nav.navigate('Cards')} />
        <Divider />
        <ListRow icon="silverware-fork-knife" iconColor="#2FA84F" title="Vales e benefícios" subtitle={s.wallets.filter((w) => !w.archived).length ? `${s.wallets.filter((w) => !w.archived).length} cadastrados` : 'Vale refeição, alimentação...'} right={chevron} onPress={() => nav.navigate('Wallets')} />
        <Divider />
        <ListRow icon="shape-outline" iconColor="#3987E5" title="Categorias" subtitle={`${s.categories.filter((c) => !c.archived).length} categorias`} right={chevron} onPress={() => nav.navigate('Categories')} />
        <Divider />
        <ListRow icon="calendar-sync-outline" iconColor="#E8590C" title="Planejamento" subtitle={`${s.recurrings.length} fixos mensais · parcelamentos`} right={chevron} onPress={() => nav.navigate('Plans')} />
      </Card>

      <SectionTitle title="Preferências" />
      <Card padded={false} style={{ paddingVertical: 4 }}>
        <ListRow
          icon="calendar-sync-outline"
          iconColor={colors.primary}
          title="Ciclo do mês"
          subtitle={ledger.customCycle ? cycleSubtitle : 'Mês civil (dia 1 ao último dia)'}
          right={chevron}
          onPress={() => nav.navigate('Cycle')}
        />
        <Divider />
        <ListRow
          icon="bell-ring-outline"
          iconColor={colors.warning}
          title="Central de avisos"
          subtitle="Contas vencidas, de hoje e das próximas semanas"
          right={chevron}
          onPress={() => nav.navigate('NotificationCenter')}
        />
        <Divider />
        <ListRow
          icon="bell-outline"
          iconColor={colors.textSecondary}
          title="Lembretes de vencimento"
          subtitle={notif.enabled ? `Ativado · ${notif.offsets.length} avisos por conta` : 'Desativado'}
          right={chevron}
          onPress={() => nav.navigate('Notifications')}
        />
      </Card>

      <SectionTitle title="Seus dados" />
      <Card padded={false} style={{ paddingVertical: 4 }}>
        <ListRow icon="export-variant" iconColor={colors.primary} title="Exportar backup" subtitle={busy ? 'Gerando arquivo...' : 'Salvar no Drive, e-mail, WhatsApp...'} right={chevron} onPress={exportBackup} />
        <Divider />
        <ListRow icon="import" iconColor={colors.warning} title="Restaurar backup" subtitle="Importar um arquivo .json do Lumen" right={chevron} onPress={importBackup} />
        <Divider />
        <ListRow icon="delete-forever-outline" iconColor={colors.danger} title="Apagar todos os dados" right={chevron} onPress={wipe} />
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 6, marginTop: 10 }}>
        <Icon name="shield-lock-outline" size={16} color={colors.muted} />
        <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
          Seus dados ficam apenas neste celular. Faça backups periódicos para não perder nada se trocar de aparelho.
        </T>
      </View>

      <View style={{ alignItems: 'center', marginTop: 36, gap: 6 }}>
        <Image source={require('../../assets/logo-mark.png')} style={{ width: 64, height: 64 }} />
        <T size={18} weight="extrabold">Lumen</T>
        <T size={12.5} color={colors.muted}>Versão {Constants.expoConfig?.version ?? '1.0.0'} · {s.entries.length + s.recurrings.length} lançamentos</T>
      </View>
    </ScrollView>
  );
}
