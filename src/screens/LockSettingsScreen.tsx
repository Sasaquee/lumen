import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Card, Chip, Divider, Icon, ListRow, SectionTitle, T } from '../components/ui';
import { MIN_SECRET, SecretInput } from '../components/LockPad';
import { askBiometric } from '../components/LockGate';
import { useStore } from '../data/store';
import { setSetting } from '../data/db';
import { RecoveryCodeModal } from '../components/RecoveryCodeModal';
import {
  checkSecret, createRecoveryCode, LOCK_BIOMETRIC, LOCK_LABELS, LOCK_TIMEOUT, lockConfig, removeLock, saveLock, TIMEOUT_OPTIONS, type LockType,
} from '../data/lock';

type Flow =
  | { kind: 'create'; type: LockType; first: string | null }
  | { kind: 'verify'; then: 'change' | 'remove' | 'recovery' };

const TYPE_INFO: Record<LockType, { icon: string; text: string }> = {
  pin: { icon: 'dialpad', text: 'De 4 a 8 números' },
  password: { icon: 'form-textbox-password', text: 'Letras, números e símbolos' },
  pattern: { icon: 'gesture', text: 'Ligue os pontos de uma grade 3x3' },
};

export default function LockSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { ledger, refresh } = useStore();
  const cfg = lockConfig(ledger.snap.settings);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [error, setError] = useState(false);
  const [hasBio, setHasBio] = useState(false);
  // código recém-gerado: aparece uma vez e some
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  // tipo escolhido enquanto a senha atual é conferida
  const pending = useRef<LockType>('pin');

  useEffect(() => {
    (async () => {
      try {
        setHasBio((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
      } catch { setHasBio(false); }
    })();
  }, []);

  const fail = () => { setError(true); setTimeout(() => setError(false), 800); };

  const pickType = (type: LockType) => {
    pending.current = type;
    if (cfg.type) setFlow({ kind: 'verify', then: 'change' });
    else setFlow({ kind: 'create', type, first: null });
  };

  const onSecret = (secret: string) => {
    if (!flow) return;
    if (flow.kind === 'verify') {
      if (!checkSecret(cfg, secret)) return fail();
      if (flow.then === 'remove') {
        removeLock();
        refresh();
        setFlow(null);
        return;
      }
      if (flow.then === 'recovery') {
        setFlow(null);
        setRecoveryCode(createRecoveryCode());
        refresh();
        return;
      }
      setFlow({ kind: 'create', type: pending.current, first: null });
      return;
    }
    if (flow.first == null) {
      if (secret.length < MIN_SECRET) { fail(); return; }
      setFlow({ ...flow, first: secret });
      return;
    }
    if (flow.first !== secret) { fail(); setFlow({ ...flow, first: null }); Alert.alert('Não confere', 'As duas não são iguais. Comece de novo.'); return; }
    const type = flow.type;
    setFlow(null);
    const firstTime = !cfg.hasRecovery;
    Alert.alert(
      'Guarde bem essa senha',
      (firstTime
        ? 'Em seguida o app mostra um código de recuperação — é a única forma de abrir o app se você esquecer a senha, porque o Lumen funciona sem internet e sem conta. '
        : 'Seu código de recuperação continua o mesmo. ')
        + 'Sem a senha e sem o código, só reinstalando o app e restaurando um backup.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Entendi, ativar',
          onPress: () => {
            saveLock(type, secret);
            if (firstTime) setRecoveryCode(createRecoveryCode());
            refresh();
          },
        },
      ],
    );
  };

  const toggleBio = async (on: boolean) => {
    if (on && !(await askBiometric('Confirme sua digital'))) return;
    setSetting(LOCK_BIOMETRIC, on ? '1' : '0');
    refresh();
  };

  const title = !flow ? '' : flow.kind === 'verify'
    ? `Confirme ${cfg.type === 'pattern' ? 'o padrão' : cfg.type === 'pin' ? 'o PIN' : 'a senha'} atual`
    : flow.first == null
      ? (flow.type === 'pattern' ? 'Desenhe o novo padrão' : flow.type === 'pin' ? 'Crie um PIN' : 'Crie uma senha')
      : (flow.type === 'pattern' ? 'Desenhe de novo para confirmar' : 'Digite de novo para confirmar');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={cfg.type ? 'lock' : 'lock-open-variant-outline'} size={26} color={cfg.type ? colors.primary : colors.muted} />
        <View style={{ flex: 1 }}>
          <T size={15.5} weight="semibold">{cfg.type ? `Bloqueado com ${LOCK_LABELS[cfg.type].toLowerCase()}` : 'Sem bloqueio'}</T>
          <T size={12.5} color={colors.muted}>{cfg.type ? 'O app pede a senha ao abrir.' : 'Qualquer pessoa com o celular desbloqueado abre o app.'}</T>
        </View>
      </Card>

      <SectionTitle title={cfg.type ? 'Trocar o tipo ou a senha' : 'Escolha o tipo de bloqueio'} />
      <Card padded={false} style={{ paddingVertical: 4 }}>
        {(['pin', 'password', 'pattern'] as LockType[]).map((t, i) => (
          <View key={t}>
            {i > 0 && <Divider />}
            <ListRow
              icon={TYPE_INFO[t].icon}
              iconColor={cfg.type === t ? colors.primary : colors.textSecondary}
              title={LOCK_LABELS[t]}
              subtitle={TYPE_INFO[t].text}
              right={cfg.type === t ? <Icon name="check-circle" color={colors.primary} /> : <Icon name="chevron-right" color={colors.muted} />}
              onPress={() => pickType(t)}
            />
          </View>
        ))}
      </Card>

      {cfg.type ? (
        <>
          <SectionTitle title="Pedir de novo depois de sair do app" />
          <View style={styles.wrap}>
            {TIMEOUT_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} active={cfg.timeout === o.value} onPress={() => { setSetting(LOCK_TIMEOUT, String(o.value)); refresh(); }} />
            ))}
          </View>
          <T size={12.5} color={colors.muted} style={{ marginTop: 8, paddingHorizontal: 4, lineHeight: 18 }}>
            {cfg.timeout < 0
              ? 'Pede só quando o app é aberto do zero.'
              : 'Pede ao abrir o app e ao voltar depois desse tempo em segundo plano. Sair para escolher um arquivo ou print não conta.'}
          </T>

          <SectionTitle title="Atalho" />
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="fingerprint" size={24} color={hasBio ? colors.primary : colors.muted} />
            <View style={{ flex: 1 }}>
              <T>Desbloquear com a digital</T>
              <T size={12} color={colors.muted}>
                {hasBio ? 'A senha continua valendo como alternativa.' : 'Cadastre uma digital nas configurações do celular para usar.'}
              </T>
            </View>
            <Switch
              value={cfg.biometric}
              disabled={!hasBio}
              onValueChange={toggleBio}
              trackColor={{ true: colors.primaryDark, false: colors.surface3 }}
              thumbColor={cfg.biometric ? colors.primary : colors.muted}
            />
          </Card>

          <SectionTitle title="Se esquecer a senha" />
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="key-variant" size={24} color={cfg.hasRecovery ? colors.primary : colors.warning} />
              <View style={{ flex: 1 }}>
                <T>Código de recuperação</T>
                <T size={12} color={colors.muted}>
                  {cfg.hasRecovery
                    ? 'Ativo. Na tela de bloqueio, "Esqueci minha senha" pede este código.'
                    : 'Nenhum código ativo. Gere um para não ficar sem saída.'}
                </T>
              </View>
            </View>
            <Pressable onPress={() => setFlow({ kind: 'verify', then: 'recovery' })} style={styles.recoveryBtn}>
              <Icon name="refresh" size={18} color={colors.primary} />
              <T size={14} color={colors.primary} weight="medium">{cfg.hasRecovery ? 'Gerar um código novo' : 'Gerar código'}</T>
            </Pressable>
            {cfg.hasRecovery ? <T size={11.5} color={colors.muted}>Perdeu o papel? Gere outro: o antigo deixa de valer na hora.</T> : null}
          </Card>

          <Pressable onPress={() => setFlow({ kind: 'verify', then: 'remove' })} style={styles.remove}>
            <Icon name="lock-open-variant-outline" size={20} color={colors.danger} />
            <T color={colors.danger} weight="medium">Remover bloqueio</T>
          </Pressable>
        </>
      ) : null}

      <View style={styles.note}>
        <Icon name="information-outline" size={18} color={colors.muted} />
        <T size={12.5} color={colors.muted} style={{ flex: 1, lineHeight: 18 }}>
          O app não tem conta nem internet: se esquecer a senha, só o código de recuperação libera o app. A senha e o código
          ficam guardados só como códigos embaralhados neste celular e não vão junto no backup exportado.
        </T>
      </View>

      <RecoveryCodeModal code={recoveryCode} onDone={() => setRecoveryCode(null)} />

      <Modal visible={!!flow} animationType="slide" onRequestClose={() => setFlow(null)} statusBarTranslucent navigationBarTranslucent>
        <View style={[styles.flow, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
          <Pressable hitSlop={12} onPress={() => setFlow(null)} style={{ alignSelf: 'flex-start', padding: 8 }}>
            <Icon name="close" size={26} color={colors.text} />
          </Pressable>
          <T size={20} weight="bold" align="center" style={{ marginTop: 24 }}>{title}</T>
          <T size={13.5} color={error ? colors.danger : colors.muted} align="center" style={{ marginTop: 6, marginBottom: 32 }}>
            {error
              ? (flow?.kind === 'create' && flow.first == null ? `Use pelo menos ${MIN_SECRET} ${flow.type === 'pattern' ? 'pontos' : flow.type === 'pin' ? 'números' : 'caracteres'}.` : 'Não confere. Tente de novo.')
              : flow?.kind === 'create' && flow.type === 'pin' ? 'De 4 a 8 números' : ' '}
          </T>
          {flow ? (
            <View style={{ alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 24 }}>
              <SecretInput
                key={`${flow.kind}-${flow.kind === 'create' ? flow.first ?? '' : ''}`}
                type={flow.kind === 'verify' ? cfg.type! : flow.type}
                pinLength={flow.kind === 'verify' ? cfg.pinLength || undefined : flow.first != null && flow.type === 'pin' ? flow.first.length : undefined}
                onSubmit={onSecret}
                error={error}
                submitLabel={flow.kind === 'create' && flow.first == null ? 'Continuar' : 'Confirmar'}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recoveryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 4 },
  remove: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, padding: 14, borderRadius: 14, backgroundColor: colors.dangerSoft },
  note: { flexDirection: 'row', gap: 8, marginTop: 20, paddingHorizontal: 4 },
  flow: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
});
