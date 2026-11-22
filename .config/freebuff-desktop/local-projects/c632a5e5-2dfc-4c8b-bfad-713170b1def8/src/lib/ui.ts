import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

/** Turns a stored "hex,hex" accent pair into a gradient style. */
export function accentStyle(accent: string): CSSProperties {
  const [from, to] = accent.split(",");
  return {
    backgroundImage: `linear-gradient(135deg, ${from ?? "#a4123f"}, ${to ?? "#ff5c97"})`,
  };
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!hasData.current) setLoading(true);
    loader()
      .then((result) => {
        if (!alive) return;
        hasData.current = true;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : "Could not load this.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload: () => setNonce((value) => value + 1) };
}

/** ISO string for a datetime-local input, one week out. */
export function defaultViewingSlot(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setHours(18, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
