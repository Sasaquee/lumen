# Lumen

App Android de controle financeiro pessoal: gastos avulsos, fixos mensais, parcelamentos, faturas de cartão e dashboard com gráficos. Dados ficam só no celular (SQLite), com backup em JSON.

## Stack

Expo SDK 57 (React Native 0.86, TypeScript) · expo-sqlite · expo-notifications · react-navigation · react-native-gifted-charts

## Estrutura

```
App.tsx                    navegação (abas + pilha) e carregamento de fontes
src/data/db.ts             schema SQLite, CRUD, backup/restauração
src/data/engine.ts         cálculo dos meses: recorrentes, parcelas, faturas de cartão, totais
src/data/store.tsx         contexto global (ledger + mês selecionado)
src/components/            UI base, gráficos, linha de lançamento
src/screens/               Início, Mês, Tabela, Mais, formulários, fatura, cartões, categorias, ciclo, planos, próximos pagamentos, central de avisos
src/utils/dates.ts         mês civil e ciclo financeiro (início, fim, a que ciclo uma data pertence)
src/data/filters.ts        grupos de gastos e ordenações da aba Mês
src/data/reminders.ts      avisos e central de avisos (lógica pura, testável)
src/data/notifications.ts  permissão, canal e agendamento no Android
```

### Regras de negócio

- Valores guardados em centavos.
- **Pago/pendente** fica na tabela `paid` com chaves `e:<entrada>:<parcela>`, `r:<recorrente>:<YYYY-MM>` e `c:<cartão>:<YYYY-MM>` (fatura inteira).
- **Cartão:** compra feita no dia de fechamento ou depois cai na fatura seguinte. Uma fatura é identificada pelo seu mês de **vencimento**, e entra no período em que a data de vencimento cai.
- **Fatura tem dois nomes e o app mostra só um.** Internamente a fatura é identificada pelo mês de vencimento (a "fatura de outubro" do banco), mas na tela ela aparece pelo **ciclo que a paga** — o mesmo nome que o mês tem no resto do app. Com ciclo começando dia 11 e vencimento dia 10, a fatura de outubro aparece como "Setembro". `invoiceMonthOfCycle` faz o caminho de volta do ciclo para a fatura. A data de fechamento e a de vencimento continuam visíveis no topo da tela, para bater com a fatura do banco.
- `entries.invoice_month` **fixa** a compra numa fatura: ao detalhar um total informado, a data da compra continua sendo a real, mas o lançamento pertence àquela fatura mesmo que a data caia em outra. Sem esse campo, vale a regra do fechamento.
- **Limite** (`cardCommitted`) é a soma das faturas em aberto do mês atual em diante — detalhado mais a parte não detalhada. Fixo mensal conta por **mês**, não por dia: "o mês dele" é o mês em que a **fatura é paga** — o mesmo em que o app mostra o lançamento. O fixo da fatura deste mês já ocupa limite mesmo que o dia da cobrança ainda não tenha chegado; o das faturas dos próximos meses só passa a ocupar quando aquele mês vira o atual, com uma exceção de segurança: cobrança que **já aconteceu** sempre conta, porque o dinheiro já saiu do limite de verdade. `cardAvailable` devolve o que resta do limite.
- **Já cobrado × projeção** (`isPendingCharge`, `Invoice.charged` / `Invoice.pending`): o banco só lança um fixo mensal no dia da cobrança, então até lá ele existe no Lumen e não na fatura do app do banco. A tela da fatura mostra os dois números com um "?" que explica a diferença e lista o que ainda não foi cobrado — dá para ver quanto se economiza cancelando a assinatura antes da data. Compra parcelada **não** entra na projeção: o banco já sabe das parcelas futuras desde a compra. `Invoice.total` continua sendo a projeção, que é o que o resto do app usa para planejar o mês.
- Como o total informado vem do app do banco, ele cobre só o que já foi cobrado: o **não detalhado** é `total informado − detalhado já cobrado`, e o fixo mensal pendente entra **por cima** em vez de ser descontado.
- **Total da fatura informado:** em `invoice_totals (card_id, month)` a pessoa grava o valor cheio que veio na fatura. Os lançamentos daquela fatura passam a ser o "detalhado" e a diferença vira gasto **não detalhado** — eles não somam por cima do total. Se o detalhado ultrapassar o total informado, vale a soma dos detalhes (para não subestimar o mês) e a tela avisa. A parte não detalhada aparece nos gráficos como categoria sintética e também ocupa limite do cartão.
- **Ciclo financeiro:** `settings.cycle_start_day` define o dia em que o mês financeiro começa (1 = mês civil, o padrão). Com dia 6, "Setembro" vai de 06/09 a 05/10 — útil para contas que vencem no começo do mês seguinte mas são pagas no mês corrente. Ciclos que começam depois do dia 15 levam o nome do mês seguinte (dia 25 → "Setembro" = 25/08 a 24/09). Os ciclos são contíguos e sem sobreposição, então nada é contado duas vezes nem fica de fora. Mudar o ciclo só reagrupa: nenhuma data de lançamento é alterada.
- **Recorrentes:** "alterar valor só deste mês" cria um registro em `recurring_overrides`; "alterar a partir de um mês" encerra o recorrente antigo e cria outro, preservando o histórico. A chave do ajuste é o `chargeMonth` do item: fora do cartão é o próprio ciclo, no cartão é o mês civil da cobrança.
- **Preferências** (`settings`) ficam fora de "apagar todos os dados" e do `wipeAll`, mas entram no backup.
- **Grupos de gastos** (filtros da aba Mês) saem das próprias categorias cadastradas — criar uma categoria já a coloca no filtro — mais o grupo "Cartão de crédito". Um item pertence ao grupo da sua categoria e, se estiver em fatura, também ao do cartão; o filtro é OU entre os grupos marcados.
- A parte não detalhada de uma fatura é exposta por `Ledger.expenseItems` como um item sintético (`source: 'undetailed'`, categoria `-1`) para aparecer em listas, filtros e no gráfico como qualquer despesa. Ele não existe em `MonthData`, então não afeta os totais, que já somam `undetailed` à parte.
- **Gráfico de categorias** tem dois modos (`CardMode`). Em `grouped` (padrão) tudo que passa no cartão vira a fatia sintética "Cartão de crédito" (categoria `-2`) e sai da categoria própria, para nada contar duas vezes. Em `open` o que está detalhado volta para a categoria do lançamento e só o não detalhado fica em Cartão de crédito. Os dois modos somam o mesmo total.
- Cada item carrega `dueDate`: no cartão é o vencimento da fatura, fora dele é a própria data. É por ela que `byCategoryRange` soma períodos no nível do dia, então cada parcela conta uma vez só, no mês em que é paga.
- **Lembretes** são notificações locais agendadas por data, agrupadas por **dia em que o aviso dispara** — não por vencimento. No fim do ciclo várias contas caem juntas e isso viraria uma enxurrada; o aviso é um resumo curto e o detalhe fica na central de avisos, dentro do app (tocar na notificação abre ela). Contas e faturas já pagas não geram aviso, e `syncReminders` reprograma tudo do zero a cada escrita no banco (o `useEffect` do `StoreProvider`), então quitar uma conta apaga o lembrete dela.
- **A aba Mês nunca lista gasto de cartão item a item**: cada fatura aparece como uma linha (`Ledger.invoiceItem`), e o detalhe fica na tela da fatura. Por isso `Ledger.listItems` (o que a lista mostra) é diferente de `Ledger.expenseItems` (tudo, usado nos gráficos).
- O teto de `MAX_SCHEDULED` existe porque o Android limita alarmes pendentes; ficam os vencimentos mais próximos.

## Rodar / gerar APK

```bash
npm install
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Para desenvolvimento com recarga ao vivo: `npx expo run:android` (build de debug + Metro).
