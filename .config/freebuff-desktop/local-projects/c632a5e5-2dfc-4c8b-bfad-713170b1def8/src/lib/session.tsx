import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Role, Session } from "../../shared/types";
import { api, errorMessage } from "./api";

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  role: "tenant" | "landlord";
  age18: boolean;
  policy: boolean;
};

type SessionState = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<Session>;
  signUp: (input: SignUpInput) => Promise<Session>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function homeForRole(role: Role): string {
  if (role === "admin") return "/app/admin";
  if (role === "landlord") return "/app/requests";
  return "/app/deck";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<Session>("/api/me");
      setSession(next);
      setError(null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await api<Session>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setSession(next);
    setError(null);
    setLoading(false);
    return next;
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const next = await api<Session>("/api/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setSession(next);
    setError(null);
    setLoading(false);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/api/session", { method: "DELETE" });
    } catch (cause) {
      setError(errorMessage(cause));
    }
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, error, refresh, signIn, signUp, signOut, setSession }),
    [session, loading, error, refresh, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
