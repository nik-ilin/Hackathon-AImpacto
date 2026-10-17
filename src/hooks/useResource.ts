import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/errors/messages";

export function useResource<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<{
    source: typeof loader | null;
    data: T | null;
    error: string | null;
  }>({ source: null, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const load = useCallback(() => {
    const current = ++generation.current;
    return Promise.resolve()
      .then(loader)
      .then(
        (data) => {
          if (current === generation.current)
            setState({ source: loader, data, error: null });
        },
        (failure: unknown) => {
          if (current === generation.current)
            setState({
              source: loader,
              data: null,
              error: errorMessage(failure),
            });
        },
      )
      .finally(() => {
        if (current === generation.current) setRefreshing(false);
      });
  }, [loader]);
  useEffect(() => {
    void load();
    return invalidate;
  }, [load, invalidate]);
  const reload = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);
  const current = state.source === loader;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current || refreshing,
    reload,
  };
}
