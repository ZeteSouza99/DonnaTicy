"use client";
import { createContext, useContext } from "react";
export type SessionUser = { id: string; name: string; role: string; locationId: string | null; locationName: string | null };
export const SessionContext = createContext<SessionUser | null>(null);
export function useSessionUser() {
  const user = useContext(SessionContext);
  if (!user) throw new Error("Sessão não disponível.");
  return user;
}
