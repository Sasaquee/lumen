import type { ParsedInvoice, ParsedLine } from './types';
import { cleanDescription, findInstallment, fold, isCreditText, isPaymentText, parseReais } from './text';

/** Divide uma linha de CSV respeitando aspas: `2026-10-10,"Loja, centro","106,58"`. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** "2026-10-10" ou "10/10/2026" → ISO. */
function parseDate(s: string): string | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/**
 * CSV da fatura do Nubank: `date,title,amount`. O valor positivo é compra; negativo é
 * pagamento ou estorno. A parcela vem no título: "Caedu - Parcela 2/3" ou "... - 8/10".
 *
 * O nome do arquivo (`Nubank_2026-11-10.csv`) traz o vencimento, que vira o mês sugerido.
 */
export function parseNubankCsv(text: string, fileName?: string): ParsedInvoice {
  const warnings: string[] = [];
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length) return { lines: [], total: null, dueMonth: null, warnings: ['O arquivo está vazio.'] };

  const sep = rows[0].includes(';') && !rows[0].includes(',') ? ';' : ',';
  const header = splitCsvLine(rows[0], sep).map(fold);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  let iDate = col('date', 'data');
  let iTitle = col('title', 'descricao', 'description', 'estabelecimento');
  let iAmount = col('amount', 'valor');
  const hasHeader = iDate >= 0 && iTitle >= 0 && iAmount >= 0;
  if (!hasHeader) { iDate = 0; iTitle = 1; iAmount = 2; }

  const lines: ParsedLine[] = [];
  let skipped = 0;
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(row, sep);
    const date = parseDate(cells[iDate] ?? '');
    const title = (cells[iTitle] ?? '').trim();
    const rawAmount = (cells[iAmount] ?? '').replace(/R\$\s*/i, '').trim();
    const negative = /^[-−]/.test(rawAmount);
    const cents = parseReais(rawAmount.replace(/^[-−+]\s*/, ''));
    if (!date || !title || cents == null) { skipped++; continue; }
    const type: ParsedLine['type'] = isPaymentText(title) ? 'payment' : negative || isCreditText(title) ? 'credit' : 'charge';
    lines.push({
      date,
      raw: title,
      description: cleanDescription(title),
      amount: type === 'credit' ? -cents : cents,
      installment: findInstallment(title),
      type,
    });
  }
  if (skipped) warnings.push(`${skipped} ${skipped === 1 ? 'linha não pôde ser lida' : 'linhas não puderam ser lidas'} e ficaram de fora.`);

  const fm = fileName?.match(/(\d{4})-(\d{2})-(\d{2})/);
  return { lines, total: null, dueMonth: fm ? `${fm[1]}-${fm[2]}` : null, warnings };
}
