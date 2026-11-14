"use client";
import { useCallback, useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
/** Mantém a última resposta visível e descarta requisições de filtros anteriores. */
export function useApiQuery<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean; url: string | null; revision: number }>({ data: null, error: null, loading: true, url: null, revision: -1 });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    clientFetch<T>(url, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ data, error: null, loading: false, url, revision }); })
      .catch((error) => { if (!controller.signal.aborted) setState((s) => ({ ...s, error: error instanceof Error ? error.message : "Não foi possível carregar os dados.", loading: false, url, revision })); });
    return () => controller.abort();
  }, [url, revision]);
  return { ...state, loading: !!url && (state.url !== url || state.revision !== revision), refresh };
}
