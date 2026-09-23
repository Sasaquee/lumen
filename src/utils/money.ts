const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como "R$ 1.234,56". */
export function formatMoney(cents: number): string {
  return fmt.format(cents / 100).replace(/ /g, ' ');
}

/** Versão curta para eixos: "R$ 1,2 mil". */
export function formatCompact(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1).replace('.', ',')} mil`;
  return `${Math.round(v)}`;
}

/** Divide um total em n parcelas; a primeira absorve a diferença de arredondamento. */
export function installmentAmount(total: number, n: number, index: number): number {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return index === 0 ? base + rest : base;
}
