/** Utilitários de texto compartilhados pelos importadores de fatura. */

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Minúsculas e sem acento: "Março" → "marco". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Número do mês a partir do nome, inteiro ou abreviado. */
/**
 * Número do mês pelas três primeiras letras: aceita o nome inteiro, a abreviação ("OUT")
 * e erro de OCR no meio da palavra ("setemnbro").
 */
export function monthNumber(name: string): number | undefined {
  return MONTHS[fold(name).replace(/[^a-z]/g, '').slice(0, 3)];
}

/** Nome de mês, inteiro ou abreviado, tolerando letra errada depois das três primeiras. */
export const MONTH_NAMES_RE = '(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zà-ÿ]*';

/**
 * Valor em reais escrito como o banco escreve — "1.524,23", "35,00", "106.58" ou
 * "132 26" (centavos sobrescritos lidos pelo OCR) — em centavos. Sinal fora daqui.
 */
export function parseReais(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  // centavos separados por espaço: "132 26"
  let m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+) (\d{2})$/);
  if (m) return Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]);
  // vírgula decimal, ponto de milhar
  m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/);
  if (m) return Number(m[1].replace(/\./g, '')) * 100 + Number(m[2].padEnd(2, '0'));
  // ponto decimal, vírgula de milhar (exportações em inglês)
  m = s.match(/^(\d{1,3}(?:,\d{3})+|\d+)\.(\d{1,2})$/);
  if (m) return Number(m[1].replace(/,/g, '')) * 100 + Number(m[2].padEnd(2, '0'));
  m = s.match(/^\d+$/);
  if (m) return Number(s) * 100;
  return null;
}

/** "Parcela 3/4", "Parcela 2 de 2", "... BR 3/9" → { index, total }. */
export function findInstallment(text: string): { index: number; total: number } | undefined {
  const m =
    text.match(/parcela\s*(\d{1,3})\s*(?:de|\/)\s*(\d{1,3})/i) ??
    text.match(/(?:^|[\s\-–])(\d{1,3})\s*\/\s*(\d{1,3})\s*$/);
  if (!m) return undefined;
  const index = Number(m[1]);
  const total = Number(m[2]);
  if (!(total >= 2 && index >= 1 && index <= total && total <= 120)) return undefined;
  return { index, total };
}

/** Tira da descrição o que só atrapalha: parcela, cidade/país, sufixos de adquirente. */
export function cleanDescription(raw: string): string {
  let s = raw
    .replace(/\s*[-–]\s*parcela\s*\d{1,3}\s*(?:de|\/)\s*\d{1,3}\s*$/i, '')
    .replace(/\s*parcela\s*\d{1,3}\s*(?:de|\/)\s*\d{1,3}\s*$/i, '')
    .replace(/\s*[-–]?\s*\b\d{1,3}\s*\/\s*\d{1,3}\s*$/, '')
    .trim();
  // "SAO PAULO BR", "Sao Paulo BR", "saopaulobr", "sao paulobr" no fim
  s = s.replace(/\s*s[aã]o\s*paulo\s*br\s*$/i, '').replace(/\s*s[aã]o\s*paulo\s*$/i, '');
  // "são" cortado pela quebra de linha: "mercadoliso paulobr"
  s = s.replace(/(s[aã]?o)?\s+paulo\s*(br)?$/i, '');
  // o Itaú cola a cidade e o país no nome: "Hotel pous garoupassao sebastiaobr"
  s = s.replace(/\s+br$/i, '').replace(/([a-zà-ÿ]{3,})br$/i, '$1');
  s = s.replace(/\s{2,}/g, ' ').replace(/^[\s*\-–·.]+|[\s*\-–·.]+$/g, '');
  return prettify(s || raw.trim());
}

/** Descrição toda em maiúsculas fica difícil de ler: vira "Mercado*Mercadol". */
function prettify(s: string): string {
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s*\/\-.])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** Bigramas da string compacta: base da comparação aproximada de descrições. */
function bigrams(s: string): string[] {
  const c = fold(s).replace(/[^a-z0-9]/g, '');
  const out: string[] = [];
  for (let i = 0; i < c.length - 1; i++) out.push(c.slice(i, i + 2));
  return out;
}

/**
 * Semelhança entre duas descrições (0 a 1), tolerante a erro de OCR e a sufixos
 * diferentes: "Mercadolivre*Mercsao" × "MERCADOLIVRE*MERCSAO PAULO BR".
 */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return fold(a).trim() === fold(b).trim() ? 1 : 0;
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) { hit++; pool.set(g, n - 1); }
  }
  // o menor dos dois como base: uma descrição cortada ainda casa com a inteira
  return hit / Math.min(x.length, y.length);
}

/** Pagamento da própria fatura: não é gasto, não entra. */
export function isPaymentText(desc: string): boolean {
  const f = fold(desc);
  return /^pagamento|pagamento (recebido|pix|efetuado|de fatura|fatura)|^pgto|pag(amento)? boleto/.test(f);
}

/** Estorno, devolução ou crédito: reduz a fatura. */
export function isCreditText(desc: string): boolean {
  return /estorno|reembolso|devolu|credito de|cashback|desconto/.test(fold(desc));
}
