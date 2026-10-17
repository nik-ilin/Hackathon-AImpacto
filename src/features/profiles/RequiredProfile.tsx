import { useCallback, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../app/providers/auth-context";
import { ResourceState } from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { getProfile } from "../../lib/supabase/api";

export function RequiredProfile({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const location = useLocation();
  const resource = useResource(
    useCallback(
      async () => ({
        profile: userId ? await getProfile(userId) : null,
      }),
      [userId],
    ),
  );
  return (
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {resource.data &&
        (resource.data.profile ? (
          children
        ) : (
          <Navigate
            to="/onboarding"
            replace
            state={{ from: location.pathname + location.search }}
          />
        ))}
    </ResourceState>
  );
}
