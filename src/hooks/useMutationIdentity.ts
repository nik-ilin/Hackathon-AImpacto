import { useLayoutEffect, useMemo, useRef } from "react";
import type { MutationIdentity } from "../lib/supabase/identity";

// Editors are keyed by user ID. An unmounted editor cannot finish an old save.
export function useMutationIdentity(userId: string): MutationIdentity {
  const active = useRef(true);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return useMemo(() => ({ userId, isCurrent: () => active.current }), [userId]);
}
