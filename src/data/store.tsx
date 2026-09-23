import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAll, migrate } from './db';
import { Ledger } from './engine';
import { syncReminders } from './notifications';

interface StoreValue {
  ledger: Ledger;
  month: string;
  setMonth: (m: string) => void;
  /** Recarrega do banco após qualquer escrita. */
  refresh: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

let migrated = false;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ledger, setLedger] = useState(() => {
    if (!migrated) { migrate(); migrated = true; }
    return new Ledger(loadAll());
  });
  const [month, setMonth] = useState(() => ledger.currentCycle());
  const refresh = useCallback(() => setLedger(new Ledger(loadAll())), []);
  // os avisos seguem os dados: reprograma a cada escrita
  useEffect(() => { syncReminders(ledger).catch(() => {}); }, [ledger]);
  const value = useMemo(() => ({ ledger, month, setMonth, refresh }), [ledger, month, refresh]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fora do StoreProvider');
  return ctx;
}
