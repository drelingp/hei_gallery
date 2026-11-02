'use client';

import { useCallback, useEffect, useState } from 'react';

type CsrfResponse = {
  csrf?: string;
  error?: string;
};

export function useCsrf(initialCsrf?: string | null) {
  const [csrf, setCsrf] = useState(initialCsrf ?? '');
  const [csrfLoading, setCsrfLoading] = useState(!initialCsrf);
  const [csrfError, setCsrfError] = useState<string | null>(null);

  const ensureCsrf = useCallback(async () => {
    if (csrf) return csrf;

    setCsrfLoading(true);
    setCsrfError(null);
    try {
      const res = await fetch('/api/csrf', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as CsrfResponse;
      if (!res.ok || !data.csrf) {
        throw new Error(data.error ?? 'Could not prepare form security token.');
      }
      setCsrf(data.csrf);
      return data.csrf;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not prepare form security token.';
      setCsrfError(message);
      return null;
    } finally {
      setCsrfLoading(false);
    }
  }, [csrf]);

  useEffect(() => {
    if (!csrf) void ensureCsrf();
    else setCsrfLoading(false);
  }, [csrf, ensureCsrf]);

  return { csrf, csrfLoading, csrfError, ensureCsrf };
}
