import { requireNativeModule } from 'expo';

/** Uma linha de texto reconhecida, com a caixa dela em pixels da imagem. */
export interface OcrLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrResult {
  width: number;
  height: number;
  lines: OcrLine[];
}

const LumenOcr = requireNativeModule<{ recognize(uri: string): Promise<OcrResult> }>('LumenOcr');

/** Reconhece o texto de uma imagem local (file:// ou content://), sem internet. */
export function recognize(uri: string): Promise<OcrResult> {
  return LumenOcr.recognize(uri);
}
