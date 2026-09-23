import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Kind, Method } from '../data/types';
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
  Table: undefined;
  More: undefined;
};

export type RootProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
