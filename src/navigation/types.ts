import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Kind, LoanType, Method } from '../data/types';
import type { Sort } from '../data/filters';

export type RootStackParamList = {
  Tabs: undefined;
  EntryForm: {
    kind?: Kind;
    mode?: 'single' | 'installments' | 'recurring';
    entryId?: number;
    recurringId?: number;
    editMonth?: string;
    /** Pré-preenchimento (usado ao detalhar uma fatura). */
    method?: Method;
    cardId?: number;
    walletId?: number;
    date?: string;
    /** Fixa a compra nesta fatura (YYYY-MM), independentemente da data escolhida. */
    invoiceMonth?: string;
  };
  Invoice: { cardId: number; month: string };
  /** Importar CSV ou prints para a fatura que vence em `month`. */
  ImportInvoice: { cardId: number; month: string };
  ImportHelp: undefined;
  LockSettings: undefined;
  Loans: undefined;
  LoanForm: { id?: number; type?: LoanType };
  LoanDetail: { id: number };
  /** A tabela de meses saiu da barra de abas para dar lugar a Contas. */
  Table: undefined;
  /** Só na build de desenvolvimento. */
  OcrLab: undefined;
  Cards: undefined;
  CardForm: { id?: number };
  Wallets: undefined;
  WalletForm: { id?: number };
  Categories: undefined;
  Cycle: undefined;
  Upcoming: undefined;
  Plans: undefined;
  Notifications: undefined;
  NotificationCenter: undefined;
  CategoryForm: { id?: number; kind?: Kind };
};

export type TabParamList = {
  Home: undefined;
  /** Filtros vindos de outra tela (ex.: um grupo do gráfico de rosca). */
  Month: { groups?: string[]; sort?: Sort; status?: 'all' | 'paid' | 'unpaid'; ts?: number } | undefined;
  Add: undefined;
  Accounts: undefined;
  More: undefined;
};

export type RootProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
