export type Kind = 'expense' | 'income';
export type Method = 'pix' | 'debito' | 'dinheiro' | 'boleto' | 'cartao' | 'vr';

/**
 * Vale (refeição, alimentação, combustível...) é uma carteira à parte: o crédito não é
 * dinheiro na conta e o gasto não sai dela. Por isso os dois ficam fora do caixa.
 * O método diz só "saiu de um vale"; qual deles vem em `wallet_id`.
 */
export const VR: Method = 'vr';

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  kind: Kind;
  archived: number;
}

/** Cartão de benefício: vale refeição, alimentação, combustível, cultura... */
export interface Wallet {
  id: number;
  name: string;
  color: string;
  icon: string;
  archived: number;
}

export interface Card {
  id: number;
  name: string;
  color: string;
  closing_day: number;
  due_day: number;
  limit_cents: number | null;
  archived: number;
}

/** Lançamento pontual (avulso ou parcelado). amount_cents é o valor TOTAL. */
export interface Entry {
  id: number;
  kind: Kind;
  description: string;
  amount_cents: number;
  category_id: number | null;
  date: string;
  method: Method;
  card_id: number | null;
  /** Qual vale pagou, quando `method` é `vr`. */
  wallet_id: number | null;
  installments: number;
  notes: string | null;
  created_at: string;
  /**
   * Fatura em que a compra foi fixada (YYYY-MM). Quando preenchido vale mais que a data:
   * é o caso de detalhar um gasto dentro de um total informado.
   */
  invoice_month: string | null;
  /**
   * Valor de cada parcela em centavos (JSON), quando elas não são iguais. Nulo = total
   * dividido igualmente. Quando existe, `amount_cents` é a soma dela.
   */
  installment_amounts: string | null;
  /**
   * Quantas parcelas iniciais ficam de fora. Uma compra importada na parcela 8/10
   * aparece só da 8ª em diante: as sete anteriores já passaram e o app não as conhece.
   */
  installment_offset: number;
  /** De onde veio a linha: `csv` ou `print`. Nulo = digitado à mão. */
  import_source: string | null;
}

export type LoanType = 'emprestimo' | 'financiamento';

/** Empréstimo ou financiamento: um contrato com parcelas de valores próprios. */
export interface Loan {
  id: number;
  type: LoanType;
  description: string;
  /** Banco ou financeira. */
  lender: string | null;
  category_id: number | null;
  /** Valor liberado (o que você recebeu ou o que foi financiado). */
  principal_cents: number;
  release_date: string;
  /** 1 = o valor liberado entra como receita na data da liberação. */
  as_income: number;
  /** Data de vencimento da 1ª parcela; as seguintes vencem no mesmo dia dos meses seguintes. */
  first_due: string;
  /** Valor de cada parcela em centavos (JSON). O tamanho é o número de parcelas. */
  installment_amounts: string;
  method: Method;
  notes: string | null;
  created_at: string;
}

/** Pagamento antecipado de uma ou mais parcelas, normalmente com desconto dos juros. */
export interface LoanPrepayment {
  id: number;
  loan_id: number;
  date: string;
  amount_cents: number;
  /** Índices (0-based) das parcelas quitadas, em JSON. */
  indices: string;
}

/** Lançamento recorrente mensal. */
export interface Recurring {
  id: number;
  kind: Kind;
  description: string;
  amount_cents: number;
  category_id: number | null;
  day: number;
  method: Method;
  card_id: number | null;
  /** Qual vale credita ou paga, quando `method` é `vr`. */
  wallet_id: number | null;
  start_month: string;
  end_month: string | null;
  notes: string | null;
  created_at: string;
}

export interface RecurringOverride {
  recurring_id: number;
  month: string;
  amount_cents: number | null;
  skipped: number;
}

/**
 * Total da fatura de um cartão informado manualmente pelo usuário.
 * Os lançamentos do cartão no mês formam o "detalhado"; a diferença é gasto não detalhado.
 */
export interface InvoiceTotal {
  card_id: number;
  month: string;
  amount_cents: number;
  notes: string | null;
}

/** Preferência do app (chave/valor). */
export interface Setting {
  key: string;
  value: string;
}

export const CYCLE_START_DAY = 'cycle_start_day';
export const NOTIF_ENABLED = 'notif_enabled';
export const NOTIF_HOUR = 'notif_hour';
export const NOTIF_OFFSETS = 'notif_offsets';

/** Lê a lista de valores de parcela gravada em JSON; null quando não há ou está corrompida. */
export function parseAmounts(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.every((n) => Number.isInteger(n)) ? v : null;
  } catch {
    return null;
  }
}

export interface Paid {
  key: string;
  paid_at: string;
}

export const METHOD_LABELS: Record<Method, string> = {
  pix: 'Pix',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  cartao: 'Cartão de crédito',
  vr: 'Vale',
};

export const METHOD_ICONS: Record<Method, string> = {
  pix: 'lightning-bolt',
  debito: 'credit-card-outline',
  dinheiro: 'cash',
  boleto: 'barcode',
  cartao: 'credit-card-chip-outline',
  vr: 'silverware-fork-knife',
};
