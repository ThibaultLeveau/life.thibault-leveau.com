import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setApiSession } from "../api";
import { LoginPanel } from "./LoginPanel";
import type { Session, Theme } from "./types";

interface SessionContext {
  session: Session;
  changeTheme: (theme: Theme) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<SessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const current = useRef<Session | null>(null);
  const themeWrites = useRef<Promise<unknown>>(Promise.resolve());
  const accept = useCallback((value: Session | null) => {
    current.current = value;
    setApiSession(value);
    setSession(value);
    document.documentElement.dataset.theme = value?.theme ?? "system";
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<Session>("/auth/session", "GET", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) accept(value);
      })
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          (!(error instanceof ApiError) || error.status !== 401)
        )
          setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    const expired = () => {
      accept(null);
      setError("Votre session a expiré. Connectez-vous à nouveau.");
    };
    window.addEventListener("life-session-expired", expired);
    return () => {
      controller.abort();
      window.removeEventListener("life-session-expired", expired);
    };
  }, [accept]);
  async function changeTheme(theme: Theme) {
    const token = current.current?.csrf_token;
    const write = themeWrites.current
      .catch(() => {})
      .then(async () => {
        if (!token || current.current?.csrf_token !== token) return;
        await api("/preferences", "PUT", { theme });
        if (current.current?.csrf_token === token)
          accept({ ...current.current, theme });
      });
    themeWrites.current = write;
    await write;
  }
  async function logout() {
    await themeWrites.current.catch(() => {});
    await api("/auth/session", "DELETE");
    accept(null);
    setError("");
  }
  if (checking)
    return (
      <main className="auth-page">
        <p role="status">Ouverture de votre espace…</p>
      </main>
    );
  if (!session)
    return (
      <LoginPanel
        initialError={error}
        onLogin={(value) => {
          setError("");
          accept(value);
        }}
      />
    );
  return (
    <Context.Provider
      key={session.user_id}
      value={{ session, changeTheme, logout }}
    >
      {children}
    </Context.Provider>
  );
}

export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error("SessionProvider requis");
  return context;
}
