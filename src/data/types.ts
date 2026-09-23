export type Kind = 'expense' | 'income';
export type Method = 'pix' | 'debito' | 'dinheiro' | 'boleto' | 'cartao' | 'vr';

/**
 * Vale refeição é uma carteira à parte: o crédito não é dinheiro na conta e o gasto
 * não sai dela. Por isso os dois ficam fora do caixa e viram saldo próprio.
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
  installments: number;
  notes: string | null;
  created_at: string;
  /**
   * Fatura em que a compra foi fixada (YYYY-MM). Quando preenchido vale mais que a data:
   * é o caso de detalhar um gasto dentro de um total informado.
   */
  invoice_month: string | null;
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
  vr: 'Vale refeição',
};

export const METHOD_ICONS: Record<Method, string> = {
  pix: 'lightning-bolt',
  debito: 'credit-card-outline',
  dinheiro: 'cash',
  boleto: 'barcode',
  cartao: 'credit-card-chip-outline',
  vr: 'silverware-fork-knife',
};
