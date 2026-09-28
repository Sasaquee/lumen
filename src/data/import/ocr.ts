import type { ParsedInvoice, ParsedLine } from './types';
import {
  cleanDescription, findInstallment, fold, isCreditText, isPaymentText, MONTH_NAMES_RE, monthNumber, parseReais,
} from './text';

/** Mesmo formato que o módulo nativo devolve; repetido aqui para o parser rodar fora do app. */
export interface OcrLine { text: string; left: number; top: number; width: number; height: number }
export interface OcrPage { width: number; height: number; lines: OcrLine[] }

interface Box extends OcrLine { right: number; bottom: number; cy: number }

const pad = (n: number) => String(n).padStart(2, '0');

/** Linha que é só um valor: "R$ 85,31", "-R$ 1.524,23", "R$ 132 26". */
const MONEY_RE = /^([-−+]\s*)?R\s?[$S5]\s*([-−]\s*)?(\d{1,3}(?:\.\d{3})+(?:[,.]\d{2}|\s\d{2})?|\d+(?:[,.]\d{2}|\s\d{2})?)$/i;

/**
 * Lê um valor de uma linha do OCR. Tolera o que o OCR costuma errar em print: a seta
 * da linha colada no valor ("R$ 35,00 >"), letra no lugar de número ("R$ 164,8s") e
 * centavo sobrescrito colado no milhar ("R$ 2.42677" = R$ 2.426,77).
 * `whole` indica valor sem centavos visíveis — pode ser centavo sobrescrito lido junto.
 */
function money(text: string): { cents: number; negative: boolean; whole: boolean } | null {
  let t = text.trim().replace(/\s+/g, ' ').replace(/[\s>›)\],.;:|]+$/, '')
    .replace(/(\d)\s*,\s+(\d{2})$/, '$1,$2'); // "R$ 1.640, 14"
  t = t.replace(/^([-−+]?\s*R\s?[$S5]\s*[-−]?\s*)(.+)$/i, (_, pre: string, num: string) =>
    pre + num.replace(/[sS]/g, '5').replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/B/g, '8')
      .replace(/^(\d{1,3}(?:\.\d{3})+)(\d{2})$/, '$1,$2'));
  const m = t.match(MONEY_RE);
  if (!m) return null;
  const cents = parseReais(m[3].replace(/\.(\d{2})$/, ',$1'));
  if (cents == null) return null;
  return { cents, negative: !!(m[1]?.match(/[-−]/) || m[2]), whole: /^[\d.]+$/.test(m[3]) && !/\.\d{2}$/.test(m[3]) };
}

/** Ano de uma data sem ano: a compra não pode ser depois do mês em que a fatura vence. */
function withYear(day: number, month: number, year: number | null, dueMonth: string): string | null {
  if (!month || month > 12 || day < 1 || day > 31) return null;
  let y = year ?? Number(dueMonth.slice(0, 4));
  if (y < 100) y += 2000;
  if (year == null && `${y}-${pad(month)}` > dueMonth) y--;
  return `${y}-${pad(month)}-${pad(day)}`;
}

/** Data por extenso ou abreviada no começo do texto: "30 agosto 2026", "7 de setembro", "28 OUT". */
const DATE_NAME_RE = new RegExp(`^(\\d{1,2})\\s*(?:de\\s*)?(${MONTH_NAMES_RE})\\.?(?:\\s*(?:de\\s+)?(\\d{4}))?(?:\\s+(.*))?$`, 'i');
/** Data numérica no começo do texto: "03/10", "03/10/2026". */
const DATE_NUM_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(.*))?$/;

/**
 * Data no começo de uma linha. Pode ser um cabeçalho sozinho ("25 de setembro") ou a
 * coluna de data grudada na descrição ("26 SET Spotify", "09/09 LOJAS RENNER"): nesse
 * caso `rest` é o que sobra, que é a descrição.
 */
function leadingDate(text: string, dueMonth: string, now: string): { date: string; rest: string; numeric?: boolean; year?: boolean } | null {
  const t = text.trim();
  const f = fold(t);
  if (f === 'hoje') return { date: now, rest: '' };
  if (f === 'ontem') {
    const d = new Date(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1, Number(now.slice(8, 10)) - 1);
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, rest: '' };
  }
  let m = t.match(DATE_NAME_RE);
  if (m) {
    const date = withYear(Number(m[1]), monthNumber(m[2]) ?? 0, m[3] ? Number(m[3]) : null, dueMonth);
    return date ? { date, rest: (m[4] ?? '').trim(), year: !!m[3] } : null;
  }
  m = t.match(DATE_NUM_RE);
  if (m) {
    const date = withYear(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, dueMonth);
    return date ? { date, rest: (m[4] ?? '').trim(), numeric: true, year: !!m[3] } : null;
  }
  return null;
}

/** Linhas de apoio que ficam embaixo da descrição e não dizem nada sobre a compra. */
const NOISE_RE = /^(cart\wo\s+(virtual|fisico|adicional|digital)|compra(\s+(no|a)\s+credito)?$|no credito$|credito$|as\s*\d{1,2}\s*[h:]\s*\d{2}|\d{1,2}\s*[h:]\s*\d{2}$|parcela\s*\d|\d{1,3}\s+de\s+\d{1,3}$|>$|›$|antecipar|adiantar|pagar fatura|ver fatura|filtros|suas movimenta)/i;

/** Compara sem acento: o OCR troca "ã" por "ă" ou "ä" com frequência. */
const isNoise = (text: string) => NOISE_RE.test(fold(text).trim());

/**
 * Informação do cartão, não compra: limite (total, disponível, utilizado), total da
 * fatura, fechamento, vencimento. Esses números vêm do cadastro do cartão e nunca de
 * um print — uma linha assim não vira lançamento.
 */
const CARD_INFO_RE = /^(limite|valor (parcial|total|da fatura|devido)|total|fatura|saldo|dispon|utilizado|vencimento|vence|fecha|melhor (dia|data)|pagamento minimo|resumo|compras$|produtos e servicos|pague cedo)/;
const isCardInfo = (text: string) => CARD_INFO_RE.test(fold(text).trim());

/** Palavras do topo da tela: indicam que acima do primeiro cabeçalho de data não há lançamento. */
const HEADER_RE = /fatura (aberta|atual|fechada|de )|total at[eé] o momento|resumo da fatura|melhor (dia|data)|vencimento|fecha em|vence em|lan[cç]amentos|movimenta[cç][oõ]es|limite|valor parcial/i;

/** Rótulo do total da fatura. "Limite total" não é total de fatura. */
const TOTAL_RE = /fatura (aberta|atual|fechada)|total at[eé] o momento|total da fatura|valor da fatura|valor parcial|valor devido|^total$/i;

/** Parcela escrita sozinha numa linha: "1 de 5". Só vale fora da descrição. */
const LONE_INSTALLMENT_RE = /^(\d{1,3})\s+de\s+(\d{1,3})$/;

function boxes(page: OcrPage): Box[] {
  return page.lines
    .filter((l) => l.text.trim())
    .map((l) => ({ ...l, text: l.text.trim(), right: l.left + l.width, bottom: l.top + l.height, cy: l.top + l.height / 2 }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
}

/** Procura o total da fatura: o valor ao lado ou logo abaixo do rótulo. */
function findTotal(bs: Box[]): { cents: number; whole: boolean } | null {
  for (const label of bs) {
    if (!TOTAL_RE.test(label.text.trim())) continue;
    // "Fatura aberta R$ 231,59" numa linha só
    const inline = label.text.match(/R\s?[$S5]\s*[\d.]+(?:[,\s]\d{2})?/i);
    if (inline) {
      const v = money(inline[0]);
      if (v) return v;
    }
    const near = bs
      .filter((b) => b !== label && money(b.text) && b.top >= label.top - label.height && b.top <= label.bottom + label.height * 3)
      .sort((a, b) => Math.abs(a.cy - label.cy) - Math.abs(b.cy - label.cy));
    const v = near[0] && money(near[0].text);
    if (v) return v;
  }
  return null;
}

function installmentOf(text: string) {
  const lone = text.trim().match(LONE_INSTALLMENT_RE);
  if (lone) {
    const index = Number(lone[1]);
    const total = Number(lone[2]);
    if (total >= 2 && index >= 1 && index <= total) return { index, total };
  }
  return findInstallment(text);
}

/**
 * Lê prints da lista de lançamentos da fatura (Neon, Mercado Pago, Itaú, AliExpress, Nubank e parecidos).
 *
 * Os apps têm o mesmo desenho: a data (num cabeçalho ou no começo da linha) e linhas com
 * a descrição à esquerda e o valor à direita. O OCR devolve cada pedaço com a posição
 * dele, então cada valor da coluna da direita ancora uma compra, e o texto à esquerda na
 * mesma faixa de altura é a descrição. A parcela aparece embaixo do valor ("Parcela 2 de
 * 4"), embaixo da descrição ("1 de 5") ou no fim dela ("BR 3/9").
 *
 * Fechamento, vencimento e limite que aparecem no print são ignorados: vêm do cadastro
 * do cartão. Só o total da fatura é lido, e só como sugestão.
 *
 * Os prints são lidos em ordem: a data de um vale para o topo do seguinte, e a mesma
 * compra vista em dois prints sobrepostos conta uma vez só.
 */
export function parseInvoicePrints(pages: OcrPage[], dueMonth: string, now: string): ParsedInvoice {
  const lines: ParsedLine[] = [];
  const warnings: string[] = [];
  let total: { cents: number; whole: boolean } | null = null;
  let currentDate: string | null = null;
  let undated = 0;
  const seenBefore = new Set<string>();

  pages.forEach((page, pageIndex) => {
    const bs = boxes(page);
    const W = page.width || Math.max(...bs.map((b) => b.right), 1);
    total ??= findTotal(bs);

    // marcas de data na metade esquerda: cabeçalhos e colunas de data das linhas
    // "3/9" no meio da coluna de descrição é parcela, não data: data numérica só na
    // coluna da esquerda, onde os extratos põem o dia de cada linha
    const marks = bs
      .filter((b) => b.left < W * 0.5)
      .map((b) => ({ b, d: leadingDate(b.text, dueMonth, now) }))
      .filter((m): m is { b: Box; d: NonNullable<ReturnType<typeof leadingDate>> } => !!m.d && (!m.d.numeric || m.b.left < W * 0.15));
    const firstMark = marks[0]?.b;
    const isMoneyAnchor = (b: Box) => b.left > W * 0.45 && !!money(b.text);

    // Data embaixo da compra (AliExpress: "Compra / Parcela 2/6 / 21 set."): colada na
    // última linha da compra de cima e longe da de baixo. Cabeçalho de data é o contrário:
    // fica mais perto da compra que vem depois.
    const trailing = new Map<Box, Box>(); // data -> valor da compra a que pertence
    for (const m of marks) {
      if (m.d.rest) continue;
      const owner = [...bs].reverse().find((b) => b.top < m.b.top && isMoneyAnchor(b));
      // precisa estar colada na compra: a poucas linhas do valor e sem outra data no meio
      if (!owner || m.b.top - owner.bottom > owner.height * 3) continue;
      const above = bs.filter((b) => b !== m.b && b.bottom <= m.b.top + m.b.height * 0.3);
      const nearestAbove = above.reduce<Box | null>((x, b) => (!x || b.bottom > x.bottom ? b : x), null);
      if (nearestAbove && marks.some((o) => o.b === nearestAbove)) continue;
      const below = bs.filter((b) => b !== m.b && b.top >= m.b.bottom - m.b.height * 0.3);
      if (!above.length || !below.length) {
        // última linha do print: sem nada embaixo, vale a distância para a compra de cima
        if (above.length && !below.length && m.b.top - Math.max(...above.map((b) => b.bottom)) < m.b.height * 1.2) trailing.set(m.b, owner);
        continue;
      }
      const dUp = m.b.top - Math.max(...above.map((b) => b.bottom));
      const dDown = Math.min(...below.map((b) => b.top)) - m.b.bottom;
      if (dUp < dDown * 0.6) trailing.set(m.b, owner);
    }
    const headers = marks.filter((m) => !m.d.rest && !trailing.has(m.b));

    // topo da tela do banco (total, abas de mês, resumo): nada acima da 1ª data vale.
    // Com a data embaixo da compra, a 1ª compra fica acima da 1ª data: o corte é o fim do topo.
    const topLabels = firstMark ? bs.filter((b) => b.top < firstMark.top && HEADER_RE.test(b.text)) : [];
    const startTop = !topLabels.length ? -Infinity
      : trailing.has(firstMark!) ? Math.max(...topLabels.map((b) => b.bottom))
        : firstMark!.top - firstMark!.height * 1.5;

    const anchors = bs.filter((b) => b.top >= startTop && isMoneyAnchor(b));
    const pageSeen = new Set<string>();

    anchors.forEach((a, i) => {
      const next = anchors[i + 1];
      const bandTop = a.top - a.height * 0.8;
      // data sozinha (cabeçalho) acima da compra corta a faixa da compra seguinte
      const nextHeader = headers.find((m) => m.b.top > a.top + a.height * 0.5);
      // uma compra ocupa no máximo umas quatro linhas: além disso já é o rodapé do app
      const bandBottom = Math.min(
        next ? next.top - next.height * 0.8 : Infinity,
        nextHeader ? nextHeader.b.top : Infinity,
        a.bottom + a.height * 4,
      );
      const inBand = bs.filter((b) => b !== a && b.cy >= bandTop && b.cy < bandBottom);

      // data da própria linha ("28 OUT", "09/09 LOJAS RENNER", ou embaixo dela) vale mais que o cabeçalho
      const rowMark = marks.find((m) => trailing.get(m.b) === a)
        ?? marks.find((m) => !trailing.has(m.b) && inBand.includes(m.b) && (m.d.rest || m.b.cy >= a.top - a.height * 0.5));
      const header = [...headers].reverse().find((m) => m.b.top <= a.top + a.height * 0.5);

      const left = inBand.filter((b) => b.right <= a.left + a.height && b.left < W * 0.6 && !money(b.text));
      // ícone lido como texto ("D:") não tem letra suficiente para ser descrição
      const candidates = left
        .filter((b) => b !== rowMark?.b && !marks.some((m) => m.b === b && !m.d.rest))
        .filter((b) => b.text.replace(/[^a-zA-Z0-9À-ÿ]/g, '').length > 2 || !!findInstallment(b.text));
      const descParts = candidates.filter((b) => !isNoise(b.text)).map((b) => b.text);
      if (rowMark?.d.rest) descParts.unshift(rowMark.d.rest);
      // o AliExpress não dá o nome da loja, só "Compra": melhor ela que perder a linha
      if (!descParts.length) {
        const generic = candidates.find((b) => /^compra\b/i.test(fold(b.text).trim()));
        if (generic) descParts.push(generic.text);
      }
      if (!descParts.length) return;
      const rawDesc = descParts.join(' ');
      // limite, total, vencimento: dado do cartão, não compra
      if (isCardInfo(rawDesc)) return;
      // a data da linha ("02/09") parece parcela; fica fora da busca
      const installment = inBand.filter((b) => !marks.some((m) => m.b === b)).map((b) => installmentOf(b.text)).find(Boolean)
        ?? findInstallment(rawDesc);

      const mark = rowMark ?? header;
      let date = mark?.d.date ?? currentDate;
      // sem ano na tela: a parcela X foi comprada pelo menos X-1 meses antes do vencimento
      if (date && installment && !mark?.d.year) {
        const [y, mo] = dueMonth.split('-').map(Number);
        const t = y * 12 + (mo - 1) - (installment.index - 1);
        const latest = `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
        while (date.slice(0, 7) > latest) date = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
      }
      if (!date) undated++;
      const v = money(a.text)!;
      // valor de compra sem vírgula é vírgula que o OCR perdeu: "R$ 25442" = R$ 254,42
      if (v.whole && v.cents >= 10000) v.cents = v.cents / 100;
      const type: ParsedLine['type'] = isPaymentText(rawDesc) ? 'payment' : v.negative || isCreditText(rawDesc) ? 'credit' : 'charge';
      const line: ParsedLine = {
        date: date ?? now,
        raw: rawDesc,
        description: cleanDescription(rawDesc),
        amount: type === 'credit' ? -v.cents : v.cents,
        installment,
        type,
      };
      const sig = `${line.date}|${line.amount}|${installment?.index ?? 1}/${installment?.total ?? 1}|${fold(line.description).replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
      pageSeen.add(sig);
      // o mesmo lançamento no fim de um print e no começo do seguinte
      if (pageIndex > 0 && seenBefore.has(sig)) return;
      lines.push(line);
    });

    for (const s of pageSeen) seenBefore.add(s);
    const lastHeader = [...headers].reverse()[0];
    if (lastHeader) currentDate = lastHeader.d.date;
  });

  if (undated) warnings.push(`${undated} ${undated === 1 ? 'lançamento ficou' : 'lançamentos ficaram'} sem data no print; usei a data de hoje.`);
  if (!lines.length) warnings.push('Não encontrei lançamentos nos prints. Tire o print da lista de compras da fatura, com os valores à direita.');
  // o mês da fatura é o que você escolheu: vencimento e fechamento do print não entram
  return { lines, total: resolveTotal(total, lines), dueMonth: null, warnings };
}

/**
 * O Mercado Pago escreve o total com centavos sobrescritos ("R$ 132²⁶"), que o OCR lê
 * como "R$ 13226". Sem vírgula, as duas leituras são possíveis: fica a que mais se
 * aproxima da soma dos lançamentos.
 */
function resolveTotal(total: { cents: number; whole: boolean } | null, lines: ParsedLine[]): number | null {
  if (!total) return null;
  if (!total.whole) return total.cents;
  const asCents = total.cents / 100;
  const sum = lines.filter((l) => l.type !== 'payment').reduce((s, l) => s + l.amount, 0);
  if (!lines.length) return asCents >= 100 ? asCents : total.cents;
  return Math.abs(asCents - sum) < Math.abs(total.cents - sum) ? asCents : total.cents;
}
