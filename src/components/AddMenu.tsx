import React, { useState } from 'react';
import { Sheet, SheetAction } from './ui';
import { useStore } from '../data/store';

type Go = (screen: string, params?: object) => void;

/**
 * O que o botão + oferece: lançamento, compra no cartão, contrato e importar fatura.
 * Com mais de um cartão, importar pergunta qual antes de abrir.
 */
export function AddMenu({ visible, onClose, go }: { visible: boolean; onClose: () => void; go: Go }) {
  const { ledger } = useStore();
  const [pickCard, setPickCard] = useState(false);
  const cards = ledger.snap.cards.filter((c) => !c.archived);

  const close = () => { setPickCard(false); onClose(); };
  const open = (screen: string, params: object = {}) => { close(); go(screen, params); };
  const importFor = (cardId: number) => {
    const card = cards.find((c) => c.id === cardId)!;
    open('ImportInvoice', { cardId, month: ledger.openInvoiceMonth(card) });
  };

  return (
    <Sheet visible={visible} onClose={close} title={pickCard ? 'Importar a fatura de qual cartão?' : 'Adicionar'}>
      {pickCard ? (
        cards.map((c) => <SheetAction key={c.id} icon="credit-card-outline" label={c.name} onPress={() => importFor(c.id)} />)
      ) : (
        <>
          <SheetAction icon="swap-vertical" label="Lançamento (despesa ou receita)" onPress={() => open('EntryForm')} />
          {cards.length ? (
            <SheetAction
              icon="credit-card-plus-outline"
              label="Compra no cartão"
              onPress={() => open('EntryForm', { kind: 'expense', method: 'cartao', cardId: cards.length === 1 ? cards[0].id : undefined })}
            />
          ) : null}
          <SheetAction icon="bank-outline" label="Empréstimo" onPress={() => open('LoanForm', { type: 'emprestimo' })} />
          <SheetAction icon="car-outline" label="Financiamento" onPress={() => open('LoanForm', { type: 'financiamento' })} />
          {cards.length ? (
            <SheetAction
              icon="tray-arrow-down"
              label="Importar fatura do cartão"
              onPress={() => (cards.length === 1 ? importFor(cards[0].id) : setPickCard(true))}
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
