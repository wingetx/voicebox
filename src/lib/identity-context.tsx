"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { loadIdentity, type BrowserIdentity } from "@/lib/browser-identity";

interface IdentityContextValue {
  identity: BrowserIdentity | null;
  setIdentity: (id: BrowserIdentity | null) => void;
}

const IdentityContext = createContext<IdentityContextValue>({
  identity: null,
  setIdentity: () => {},
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentityState] = useState<BrowserIdentity | null>(null);

  // Load from localStorage on mount (client-side only)
  useEffect(() => {
    setIdentityState(loadIdentity());
  }, []);

  function setIdentity(id: BrowserIdentity | null) {
    setIdentityState(id);
  }

  return (
    <IdentityContext.Provider value={{ identity, setIdentity }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  return useContext(IdentityContext);
}
