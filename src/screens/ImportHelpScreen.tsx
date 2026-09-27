import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors, font } from '../theme';
import { Button, Card, Icon, T } from '../components/ui';
import { pauseLock } from '../data/lock';

/** Modelo que o importador lê: o mesmo formato vale para qualquer banco. */
const TEMPLATE = `data;descricao;valor
05/10/2026;Mercado Extra;R$ 154,90
06/10/2026;Tênis Centauro - Parcela 2/5;R$ 89,90
07/10/2026;Estorno Uber;-R$ 15,00
08/10/2026;Netflix;55,90
`;

type SectionId = 'privacy' | 'how' | 'csv' | 'print' | 'errors';

/**
 * Tutorial da importação: o que acontece com os dados, como a fatura vira lançamentos,
 * como montar um CSV à mão e como tirar um print que o app lê bem.
 */
export default function ImportHelpScreen() {
  const [open, setOpen] = useState<SectionId | null>('privacy');

  const shareTemplate = async () => {
    try {
      const file = new File(Paths.cache, 'modelo-fatura-lumen.csv');
      if (file.exists) file.delete();
      file.create();
      file.write(TEMPLATE);
      pauseLock();
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Salvar modelo de CSV' });
    } catch (e: any) {
      Alert.alert('Não consegui gerar o modelo', String(e?.message ?? e));
    }
  };

  const Section = ({ id, icon, title, children }: { id: SectionId; icon: string; title: string; children: React.ReactNode }) => (
    <Card padded={false} style={{ marginBottom: 10 }}>
      <Pressable onPress={() => setOpen(open === id ? null : id)} style={styles.head}>
        <View style={styles.headIcon}><Icon name={icon} size={20} color={colors.primary} /></View>
        <T size={15.5} weight="semibold" style={{ flex: 1 }}>{title}</T>
        <Icon name={open === id ? 'chevron-up' : 'chevron-down'} color={colors.muted} />
      </Pressable>
      {open === id ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Section id="privacy" icon="shield-lock-outline" title="Seus dados não saem do celular">
        <P>O Lumen funciona <B>100% offline</B>. Não tem servidor, conta nem login — não existe para onde enviar nada.</P>
        <P>O CSV é lido aqui mesmo, e os prints passam por um leitor de texto (OCR) que roda <B>dentro do próprio celular</B>, sem internet. A imagem não é enviada para o Google, para o autor do app nem para ninguém.</P>
        <P>Os lançamentos ficam no banco de dados privado do app. Só saem se você mesmo exportar um backup.</P>
      </Section>

      <Section id="how" icon="swap-vertical-circle-outline" title="Como a importação funciona">
        <Step n={1}>Abra o cartão, escolha o <B>mês da fatura</B> e toque em importar.</Step>
        <Step n={2}>Escolha o <B>CSV</B> ou os <B>prints</B> da fatura.</Step>
        <Step n={3}>Confira a prévia: cada compra aparece com data, valor, parcela e uma categoria sugerida. Toque numa para corrigir; desmarque o que não deve entrar.</Step>
        <Step n={4}>Toque em importar. Nada é salvo antes disso.</Step>
        <T size={13.5} weight="semibold" style={{ marginTop: 8 }}>O que o app faz sozinho</T>
        <Bullet><B>Parcelas:</B> "Parcela 2/4" vira a compra inteira — a 3/4 e a 4/4 já aparecem nas próximas faturas.</Bullet>
        <Bullet><B>Importar de novo o mesmo mês</B> compara com o que já existe e mostra o que entrou, saiu e mudou de valor. Se algo mudou, pergunta antes de substituir.</Bullet>
        <Bullet>Diferença de <B>centavos</B> na mesma parcela entre um mês e outro é arredondamento do banco: ajusta só aquela parcela.</Bullet>
        <Bullet><B>Pagamento da fatura</B> anterior fica de fora; <B>estorno</B> entra como crédito e reduz a fatura.</Bullet>
        <Bullet>O que parece algo que você já lançou à mão, ou um fixo mensal do cartão, vem <B>desmarcado</B> para não duplicar.</Bullet>
        <Bullet><B>Fechamento, vencimento e limite do cartão nunca são lidos do arquivo.</B> Eles vêm do cadastro do cartão. Do print, só o total da fatura é usado — e só se você deixar.</Bullet>
      </Section>

      <Section id="csv" icon="file-delimited-outline" title="Montar um CSV à mão">
        <P>Se o app do banco não deixa tirar print nem exporta a fatura, dá para montar o arquivo numa planilha (Google Planilhas, Excel) ou até no bloco de notas. São três colunas:</P>
        <View style={styles.code}>
          <T style={styles.codeText}>{TEMPLATE.trim()}</T>
        </View>
        <Bullet><B>data:</B> 05/10/2026 ou 2026-10-05 — o dia da compra.</Bullet>
        <Bullet><B>descricao:</B> o nome da loja. Para parcelada, termine com <B>"Parcela 2/5"</B> (parcela atual / total).</Bullet>
        <Bullet><B>valor:</B> o valor <B>desta parcela</B>, com ou sem "R$": 1.234,56 ou 1234.56. Negativo é estorno ou crédito.</Bullet>
        <Bullet>Separe as colunas com <B>ponto e vírgula</B>. Se usar vírgula, ponha entre aspas a descrição que tiver vírgula.</Bullet>
        <Bullet>Na planilha: Arquivo → Fazer download / Salvar como → <B>CSV</B>.</Bullet>
        <Bullet>O CSV do <B>Nubank</B> já vem pronto: é só importar como está. O mês é sugerido pelo nome do arquivo.</Bullet>
        <Button style={{ marginTop: 8 }} title="Baixar modelo de CSV" icon="download" variant="secondary" onPress={shareTemplate} />
      </Section>

      <Section id="print" icon="cellphone-screenshot" title="Tirar um print que o app lê bem">
        <Bullet>Tire o print da tela com a <B>lista de lançamentos da fatura</B>, com o <B>valor de cada compra visível à direita</B>.</Bullet>
        <Bullet>Deixe aparecer a <B>data</B> de cada grupo (ex.: "25 de setembro") ou de cada linha.</Bullet>
        <Bullet>Deixe aparecer a <B>parcela</B> ("Parcela 2 de 4", "2/4") — é ela que projeta as próximas faturas.</Bullet>
        <Bullet>Lista longa? Role e tire <B>vários prints</B>, repetindo um pedacinho entre eles. Escolha na ordem, <B>de cima para baixo</B> — compra repetida conta uma vez só.</Bullet>
        <Bullet>Use o <B>print original</B> do celular: sem cortar, sem zoom e sem ser foto da tela. Print que passou pelo WhatsApp perde qualidade.</Bullet>
        <Bullet>Tema claro ou escuro, tanto faz. O total da fatura no topo ajuda a conferir, mas não é obrigatório.</Bullet>
      </Section>

      <Section id="errors" icon="eye-check-outline" title="A leitura pode errar — confira">
        <P>O leitor de print é bom, mas não é perfeito: de vez em quando troca um dígito, pula uma parcela ou uma data. Em testes com prints simulando vários bancos (claro, escuro, resoluções diferentes), acertou 104 de 105 compras — ainda assim, <B>confira a prévia com a fatura do banco</B> antes de importar.</P>
        <Bullet>Toque em qualquer compra da prévia para corrigir <B>valor, data, parcela, descrição e categoria</B>.</Bullet>
        <Bullet>Quando o print mostra o total da fatura, a prévia avisa se a soma não bater — sinal de que algo foi lido errado ou ficou fora do print.</Bullet>
        <Bullet>Depois de importado, qualquer lançamento pode ser editado ou excluído na tela da fatura, como os digitados à mão.</Bullet>
        <P>O CSV não tem esse problema: é lido exatamente como está no arquivo.</P>
      </Section>
    </ScrollView>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <T size={13.5} color={colors.textSecondary} style={{ lineHeight: 20 }}>{children}</T>;
}
function B({ children }: { children: React.ReactNode }) {
  return <T size={13.5} weight="semibold" color={colors.text}>{children}</T>;
}
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <T size={13.5} color={colors.primary}>•</T>
      <T size={13.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{children}</T>
    </View>
  );
}
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={styles.stepNum}><T size={12} weight="bold" color={colors.primary}>{n}</T></View>
      <T size={13.5} color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{children}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  headIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  code: { backgroundColor: colors.surface2, borderRadius: 10, padding: 12 },
  codeText: { fontFamily: font.medium, fontSize: 12, color: colors.text, lineHeight: 19 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
