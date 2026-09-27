import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { colors } from '../theme';
import { Button, T } from '../components/ui';
import { recognize } from '../../modules/lumen-ocr';

/**
 * Só na build de desenvolvimento: roda o OCR em todos os prints de `files/ocr-lab` e
 * manda o texto bruto para o console do Metro, onde a bateria de testes do parser lê.
 */
export default function OcrLabScreen() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const out: string[] = [];
    try {
      const dir = new Directory(Paths.document, 'ocr-lab');
      const files = dir.list().filter((f): f is File => f instanceof File && /\.(png|jpe?g)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
      for (const f of files) {
        const t0 = Date.now();
        const res = await recognize(f.uri);
        console.log(`OCRLAB_RAW ${f.name} ${JSON.stringify(res)}`);
        out.push(`${f.name}: ${res.lines.length} linhas em ${Date.now() - t0} ms`);
        setLog([...out]);
      }
      console.log('OCRLAB_DONE');
    } catch (e: any) {
      out.push(`erro: ${e?.message ?? e}`);
      setLog([...out]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Button title="Rodar OCR nos prints de teste" icon="flask-outline" onPress={run} loading={busy} />
      <View style={{ gap: 4 }}>
        {log.map((l) => <T key={l} size={12} color={colors.textSecondary}>{l}</T>)}
      </View>
    </ScrollView>
  );
}
