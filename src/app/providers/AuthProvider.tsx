import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase/client";
import { errorMessage } from "../../lib/errors/messages";

import { AuthContext } from "./auth-context";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(
    window.location.hash.includes("type=recovery"),
  );
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEventSeen = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventSeen = true;
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
      setError(null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
    });
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active || authEventSeen) return;
        setSession(data.session);
        setError(sessionError ? errorMessage(sessionError) : null);
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (active && !authEventSeen) {
          setError(errorMessage(failure));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        recovery,
        finishRecovery: () => setRecovery(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
