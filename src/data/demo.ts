import Constants from 'expo-constants';
import { db, saveCard, saveEntry, saveRecurring, setInvoiceTotal, setPaid, setSetting } from './db';
import { NOTIF_ENABLED } from './types';
import { addMonths } from '../utils/dates';

/**
 * Dados fictícios para as capturas de tela do README.
 *
 * Só roda numa build marcada com `extra.demo` no app.json — que também usa outro
 * applicationId, para conviver com o app de verdade sem encostar no banco dele.
 * Nunca roda na build normal, e nunca sobrescreve um banco que já tem coisa dentro.
 */
export const IS_DEMO = Constants.expoConfig?.extra?.demo === true;

/** Mês em que a história começa e o último mês já quitado. */
const START = '2026-01';
const SETTLED_UNTIL = '2026-08';

const cat = (name: string) =>
  db.getFirstSync<{ id: number }>('SELECT id FROM categories WHERE name = ?', name)?.id ?? null;

const isEmpty = () =>
  (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM entries')?.n ?? 0) === 0 &&
  (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM recurrings')?.n ?? 0) === 0 &&
  (db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM cards')?.n ?? 0) === 0;

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function maybeSeedDemo() {
  if (!IS_DEMO || !isEmpty()) return;

  // sem lembretes: a build de demonstração não deve notificar ninguém
  setSetting(NOTIF_ENABLED, '0');

  const roxinho = saveCard({ name: 'Roxinho', color: '#7C3AED', closing_day: 3, due_day: 10, limit_cents: 800000 });
  const azul = saveCard({ name: 'Azul', color: '#2563EB', closing_day: 20, due_day: 28, limit_cents: 600000 });

  const rec = (
    description: string, amount_cents: number, category: string, day: number,
    method: 'pix' | 'debito' | 'dinheiro' | 'boleto' | 'cartao', card_id: number | null = null,
    kind: 'expense' | 'income' = 'expense',
  ) => saveRecurring({
    kind, description, amount_cents, category_id: cat(category), day, method, card_id,
    start_month: START, end_month: null, notes: null,
  });

  const one = (
    description: string, amount_cents: number, category: string, date: string,
    method: 'pix' | 'debito' | 'dinheiro' | 'boleto' | 'cartao', card_id: number | null = null,
    installments = 1, kind: 'expense' | 'income' = 'expense',
  ) => saveEntry({
    kind, description, amount_cents, category_id: cat(category), date, method, card_id,
    installments, notes: null, invoice_month: null,
  });

  // ---------- receitas ----------
  const salario = rec('Salário', 640000, 'Salário', 5, 'pix', null, 'income');
  one('Freelance — site da padaria', 120000, 'Freelance', '2026-09-12', 'pix', null, 1, 'income');

  // ---------- fixos mensais ----------
  const aluguel = rec('Aluguel', 145000, 'Moradia', 10, 'pix');
  const academia = rec('Academia', 8990, 'Saúde', 8, 'debito');
  const plano = rec('Plano de saúde', 32000, 'Saúde', 20, 'boleto');
  const internet = rec('Internet 500 mega', 9990, 'Contas & serviços', 15, 'boleto');
  const energia = rec('Energia', 18000, 'Contas & serviços', 18, 'boleto');
  const musica = rec('Streaming de música', 2190, 'Assinaturas', 12, 'cartao', roxinho);
  // cobra dia 25: é o que aparece como "projeção" na fatura, ainda não cobrado
  const video = rec('Streaming de vídeo', 4490, 'Assinaturas', 25, 'cartao', roxinho);

  // ---------- parcelados ----------
  one('Notebook', 480000, 'Compras', '2026-06-14', 'cartao', roxinho, 12);
  one('Celular', 360000, 'Compras', '2026-05-10', 'cartao', azul, 10);
  one('Sofá', 240000, 'Moradia', '2026-08-05', 'cartao', azul, 6);
  one('Passagem aérea', 189000, 'Lazer', '2026-09-05', 'cartao', roxinho, 3);

  // ---------- avulsos do mês ----------
  const mercado = one('Mercado do mês', 64235, 'Mercado', '2026-09-05', 'debito');
  const farmacia = one('Farmácia', 8740, 'Saúde', '2026-09-09', 'pix');
  one('Jantar de aniversário', 23500, 'Alimentação', '2026-09-13', 'cartao', roxinho);
  one('Corrida de app', 4280, 'Transporte', '2026-09-16', 'cartao', azul);
  one('Ração do gato', 12990, 'Pets', '2026-09-18', 'cartao', roxinho);
  const livro = one('Livro', 6800, 'Educação', '2026-09-21', 'pix');
  one('Presente de casamento', 18000, 'Compras', '2026-09-22', 'cartao', azul);

  // ---------- total informado: mostra o "não detalhado" ----------
  setInvoiceTotal(roxinho, '2026-10', 189000, 'uns deliveries e a farmácia que não lancei');

  // ---------- o passado está quitado; só setembro em diante fica em aberto ----------
  const past = monthsBetween(START, SETTLED_UNTIL);
  for (const id of [salario, aluguel, academia, plano, internet, energia, musica, video]) {
    for (const m of past) setPaid(`r:${id}:${m}`, true);
  }
  for (const m of past) setPaid(`c:${azul}:${m}`, true);
  // a fatura do Roxinho que venceu 10/09 também já foi paga
  for (const m of [...past, '2026-09']) setPaid(`c:${roxinho}:${m}`, true);

  // ---------- e o que já foi pago neste mês ----------
  for (const id of [salario, aluguel, academia, internet, energia]) setPaid(`r:${id}:2026-09`, true);
  for (const id of [mercado, farmacia, livro]) setPaid(`e:${id}:0`, true);
}
