import type { Category } from '../types';
import { fold } from './text';

/**
 * Palavras que denunciam a categoria. A ordem importa: "mercado livre" é compra,
 * "mercado" sozinho é supermercado.
 */
const RULES: [string, RegExp][] = [
  ['Compras', /mercado ?livre|mercadol|mercpago|amazon(?! prime)|shopee|shein|aliexpress|magalu|magazine ?luiza|americanas|casas ?bahia|renner|riachuelo|c&a|caedu|decathlon|centauro|netshoes|esporte|zara|youcom|kabum|ponto frio|leroy|tok ?stok|marisa|pernambucanas|havan/],
  ['Assinaturas', /netflix|spotify|disney|hbo|max\.com|prime ?video|amazon ?prime|youtube|apple\.com|google ?(one|play|storage)|dl\*google|canva|chatgpt|openai|deezer|globoplay|paramount|crunchyroll|icloud|adobe|microsoft|xbox ?game ?pass|claude|anthropic/],
  ['Mercado', /mercado|supermerc|atacad|assai|carrefour|pao de acucar|hortifruti|sams ?club|dia brasil|oba hortifruti|sonda|zaffari|big bompreco/],
  ['Alimentação', /ifood|restaurante|lanchonete|padaria|burger|mc ?donald|pizza|rappi|cafe|subway|bk |outback|habib|sushi|churrasc|acai|sorvete|doceria|bar /],
  ['Transporte', /uber|\b99\b|99app|posto|shell|ipiranga|petrobras|combustiv|estaciona|sem parar|veloe|conectcar|metro|cptm|onibus|bilhete|taxi/],
  ['Saúde', /drogari|droga|farmac|raia|pacheco|panvel|pague menos|hospital|clinica|laborat|odonto|unimed|amil|sulamerica|dentista|otica/],
  ['Educação', /udemy|alura|curso|escola|faculdade|livraria|coursera|duolingo/],
  ['Pets', /\bpet|petz|cobasi|veterin/],
  ['Lazer', /cinema|ingresso|hotel|pous|airbnb|booking|steam|playstation|nintendo|parque|zoo|show|teatro|museu|viagem|decolar|latam|gol linhas|azul linhas/],
  ['Contas & serviços', /vivo|claro|\btim\b|sabesp|enel|cemig|comgas|copel|internet|seguro|iof|anuidade|tarifa/],
];

/** Chuta a categoria pelo nome do estabelecimento; null quando nada bate. */
export function guessCategory(description: string, categories: Category[]): number | null {
  const d = fold(description);
  const byName = new Map(categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => [fold(c.name), c.id]));
  for (const [name, re] of RULES) {
    if (!re.test(d)) continue;
    const id = byName.get(fold(name));
    if (id != null) return id;
  }
  return null;
}
