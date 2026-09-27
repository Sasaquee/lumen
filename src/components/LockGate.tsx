import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Button, Icon, Input, T } from './ui';
import { SecretInput } from './LockPad';
import { useStore } from '../data/store';
import { checkRecovery, checkSecret, lockConfig, pauseLock, removeLock, takePause, type LockConfig } from '../data/lock';

const MAX_TRIES = 5;
const WAIT_SECONDS = 30;

/** Pede a digital; devolve true se a pessoa desbloqueou. */
export async function askBiometric(prompt: string): Promise<boolean> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return false;
    pauseLock();
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Usar senha', disableDeviceFallback: true });
    return r.success;
  } catch {
    return false;
  } finally {
    takePause();
  }
}

/**
 * Tranca o app com a senha escolhida em Mais → Bloqueio do app. Pede ao abrir e ao voltar
 * de segundo plano depois do tempo configurado; saídas curtas para escolher um arquivo
 * ou um print (`pauseLock`) não contam.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { ledger, refresh } = useStore();
  const cfg = lockConfig(ledger.snap.settings);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const [locked, setLocked] = useState(() => !!cfg.type);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (backgroundAt.current == null) backgroundAt.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      const since = backgroundAt.current;
      backgroundAt.current = null;
      const paused = takePause();
      const c = cfgRef.current;
      if (!c.type || paused || since == null || c.timeout < 0) return;
      if (Date.now() - since >= c.timeout * 1000) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      {children}
      <Modal visible={locked && !!cfg.type} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
        {cfg.type ? <LockScreen cfg={cfg} onUnlock={() => setLocked(false)} onRecovered={() => { removeLock(); refresh(); setLocked(false); }} /> : null}
      </Modal>
    </>
  );
}

function LockScreen({ cfg, onUnlock, onRecovered }: { cfg: LockConfig; onUnlock: () => void; onRecovered: () => void }) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [code, setCode] = useState('');
  const [codeWrong, setCodeWrong] = useState(false);
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [, tick] = useState(0);

  const biometric = useCallback(async () => {
    if (!cfg.biometric) return;
    if (await askBiometric('Desbloquear o Lumen')) onUnlock();
  }, [cfg.biometric, onUnlock]);

  // a digital aparece sozinha ao abrir, como atalho
  useEffect(() => { biometric(); }, [biometric]);

  useEffect(() => {
    if (!waitUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= waitUntil) { setWaitUntil(null); setTries(0); }
      tick((n) => n + 1);
    }, 500);
    return () => clearInterval(t);
  }, [waitUntil]);

  const miss = () => {
    const n = tries + 1;
    setTries(n);
    setError(true);
    setTimeout(() => setError(false), 800);
    if (n >= MAX_TRIES) setWaitUntil(Date.now() + WAIT_SECONDS * 1000);
  };

  /** O código libera o app e desliga o bloqueio: vale uma vez só. */
  const recover = () => {
    if (waitUntil) return;
    if (!checkRecovery(cfg, code)) { miss(); setCodeWrong(true); return; }
    setCode('');
    onRecovered();
    Alert.alert(
      'App liberado',
      'O bloqueio foi desligado e o código de recuperação deixou de valer. Crie uma senha nova em Mais → Bloqueio do app — um código novo é gerado junto.',
    );
  };

  const submit = (secret: string) => {
    if (waitUntil) return;
    if (checkSecret(cfg, secret)) { setTries(0); onUnlock(); return; }
    miss();
  };

  const wait = waitUntil ? Math.ceil((waitUntil - Date.now()) / 1000) : 0;
  const prompt = cfg.type === 'pin' ? 'Digite seu PIN' : cfg.type === 'password' ? 'Digite sua senha' : 'Desenhe seu padrão';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <Image source={require('../../assets/logo-mark.png')} style={{ width: 64, height: 64 }} />
      <T size={20} weight="bold" style={{ marginTop: 14 }}>Lumen bloqueado</T>
      <T size={14} color={error ? colors.danger : colors.textSecondary} style={{ marginTop: 6, marginBottom: 28 }}>
        {wait > 0 ? `Muitas tentativas. Tente de novo em ${wait}s` : error ? 'Não confere. Tente de novo' : recovering ? 'Recuperar acesso' : prompt}
      </T>
      {recovering ? (
        <View style={{ alignSelf: 'stretch', paddingHorizontal: 24, gap: 14, opacity: wait > 0 ? 0.35 : 1 }} pointerEvents={wait > 0 ? 'none' : 'auto'}>
          <T size={13.5} color={colors.textSecondary} align="center" style={{ lineHeight: 20 }}>
            Digite o código de recuperação que apareceu quando você criou a senha.
          </T>
          <Input
            value={code}
            onChangeText={(t) => { setCode(t); setCodeWrong(false); }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            placeholder="XXXX-XXXX-XXXX-XXXX"
            style={[{ textAlign: 'center', letterSpacing: 1.5, fontSize: 17 }, codeWrong ? { borderColor: colors.danger, borderWidth: 1 } : null]}
          />
          {codeWrong ? (
            <T size={13} color={colors.danger} align="center">Esse código não confere. Confira letra por letra — sem 0/O nem 1/I.</T>
          ) : null}
          <Button title="Liberar o app" icon="key-variant" onPress={recover} disabled={code.replace(/[^a-z0-9]/gi, '').length < 16} />
          <Pressable onPress={() => { setRecovering(false); setCode(''); }} style={{ alignSelf: 'center', padding: 8 }}>
            <T color={colors.primary}>Voltar para a senha</T>
          </Pressable>
        </View>
      ) : (
      <View style={{ opacity: wait > 0 ? 0.35 : 1, alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: 24 }} pointerEvents={wait > 0 ? 'none' : 'auto'}>
        <SecretInput
          type={cfg.type!}
          pinLength={cfg.pinLength || undefined}
          onSubmit={submit}
          error={error}
          submitLabel="Desbloquear"
          extraKey={cfg.biometric ? { icon: 'fingerprint', onPress: biometric } : undefined}
        />
      </View>
      )}
      {!recovering && cfg.biometric && cfg.type !== 'pin' ? (
        <Pressable onPress={biometric} style={styles.bio}>
          <Icon name="fingerprint" size={26} color={colors.primary} />
          <T color={colors.primary} weight="medium">Usar digital</T>
        </Pressable>
      ) : null}
      {!recovering && cfg.hasRecovery ? (
        <Pressable onPress={() => setRecovering(true)} style={{ marginTop: 'auto', padding: 12 }}>
          <T size={13.5} color={colors.muted}>Esqueci minha senha</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  bio: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, padding: 12 },
});
