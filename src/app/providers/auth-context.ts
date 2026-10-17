import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export const AuthContext = createContext<{
  session: Session | null;
  identityEpoch: number;
  loading: boolean;
  error: string | null;
  recovery: boolean;
  finishRecovery: () => void;
} | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth requiere AuthProvider.");
  return context;
}
