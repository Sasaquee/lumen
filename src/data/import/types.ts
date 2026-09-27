/** Uma linha lida de uma fatura (CSV ou print), antes de virar lançamento. */
export interface ParsedLine {
  /** Data de referência como aparece na fatura (YYYY-MM-DD). */
  date: string;
  /** Descrição limpa, para mostrar e gravar. */
  description: string;
  /** Texto original, para conferência. */
  raw: string;
  /** Valor da parcela desta fatura, em centavos. Crédito vem negativo. */
  amount: number;
  installment?: { index: number; total: number };
  /** `payment` é o pagamento da fatura anterior: nunca vira lançamento. */
  type: 'charge' | 'credit' | 'payment';
}

export interface ParsedInvoice {
  lines: ParsedLine[];
  /** Total da fatura que o banco mostra, quando dá para ler. */
  total: number | null;
  /** Mês de vencimento que o próprio arquivo sugere (YYYY-MM). */
  dueMonth: string | null;
  /** Avisos de leitura para mostrar na prévia. */
  warnings: string[];
}
