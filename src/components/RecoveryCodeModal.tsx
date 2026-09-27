import React, { useState } from 'react';
import { Modal, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../theme';
import { Button, Icon, Input, T } from './ui';
import { normalizeCode, pauseLock } from '../data/lock';

/**
 * Mostra o código de recuperação uma única vez. Para fechar, a pessoa digita os últimos
 * quatro caracteres — o jeito de ter certeza de que ele foi anotado de verdade.
 */
export function RecoveryCodeModal({ code, onDone }: { code: string | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [check, setCheck] = useState('');
  const tail = code ? normalizeCode(code).slice(-4) : '';
  const ok = normalizeCode(check) === tail;

  const share = async () => {
    if (!code) return;
    pauseLock();
    await Share.share({ message: `Código de recuperação do Lumen: ${code}` }).catch(() => {});
  };

  return (
    <Modal visible={!!code} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.icon}><Icon name="key-variant" size={30} color={colors.primary} /></View>
        <T size={21} weight="bold" align="center">Seu código de recuperação</T>
        <T size={14} color={colors.textSecondary} align="center" style={{ lineHeight: 21 }}>
          Se um dia você esquecer a senha, é este código que libera o app. Ele aparece <T size={14} weight="semibold">só agora</T>.
        </T>

        <View style={styles.codeBox}>
          <T style={styles.code}>{code}</T>
        </View>

        <View style={{ gap: 8 }}>
          <Tip icon="pencil-outline" text="Anote num papel ou num gerenciador de senhas." />
          <Tip icon="cellphone-off" text="Guarde fora deste celular: se perder o acesso a ele, o código junto não ajuda." />
          <Tip icon="numeric-1-circle-outline" text="Vale uma vez só. Depois de usado, crie uma senha nova e um código novo é gerado." />
          <Tip icon="alert-outline" text="Sem a senha e sem este código, a única saída é reinstalar o app e restaurar um backup." />
        </View>

        <Button title="Enviar para mim (anotações, e-mail...)" icon="share-variant" variant="secondary" onPress={share} />

        <View style={{ gap: 8, marginTop: 8 }}>
          <T size={13} weight="medium" color={colors.textSecondary}>Para confirmar que anotou, digite os 4 últimos caracteres</T>
          <Input
            value={check}
            onChangeText={setCheck}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            placeholder="Ex.: 7Q2M"
            style={{ textAlign: 'center', letterSpacing: 4, fontFamily: font.semibold, fontSize: 18 }}
          />
        </View>
        <Button title="Guardei o código" icon="check" disabled={!ok} onPress={() => { setCheck(''); onDone(); }} />
      </ScrollView>
    </Modal>
  );
}

function Tip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon name={icon} size={18} color={colors.primary} />
      <T size={13} color={colors.textSecondary} style={{ flex: 1, lineHeight: 19 }}>{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignSelf: 'center', width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  codeBox: { backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 20, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  code: { fontFamily: font.bold, fontSize: 22, letterSpacing: 2, color: colors.text },
});
