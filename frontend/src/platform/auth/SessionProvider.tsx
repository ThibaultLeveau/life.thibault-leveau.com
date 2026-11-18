import { tr } from "../../shared/i18n";
import { useTranslation } from "react-i18next";
import { browserLocale, setLanguage, type Locale } from "../i18n";
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
  changeLocale: (locale: Locale) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<SessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const current = useRef<Session | null>(null);
  const preferenceWrites = useRef<Promise<unknown>>(Promise.resolve());
  const accept = useCallback((value: Session | null) => {
    current.current = value;
    setApiSession(value);
    setLanguage(value?.locale ?? browserLocale());
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
      setError(tr("your_session_has_expired_sign_in_again"));
    };
    const syncAssistantPreferences = (event: Event) => {
      const preferences = (
        event as CustomEvent<Pick<Session, "theme" | "locale">>
      ).detail;
      if (current.current && preferences)
        accept({ ...current.current, ...preferences });
    };
    window.addEventListener("life-assistant-changed", syncAssistantPreferences);
    window.addEventListener("life-session-expired", expired);
    return () => {
      controller.abort();
      window.removeEventListener("life-session-expired", expired);
      window.removeEventListener(
        "life-assistant-changed",
        syncAssistantPreferences,
      );
    };
  }, [accept]);
  async function changePreferences(
    patch: Partial<Pick<Session, "theme" | "locale">>,
  ) {
    const token = current.current?.csrf_token;
    const write = preferenceWrites.current
      .catch(() => {})
      .then(async () => {
        if (!token || current.current?.csrf_token !== token) return;
        const preferences = await api<Pick<Session, "theme" | "locale">>(
          "/preferences",
          "PUT",
          patch,
        );
        if (current.current?.csrf_token === token)
          accept({ ...current.current, ...preferences });
      });
    preferenceWrites.current = write;
    await write;
  }
  async function logout() {
    await preferenceWrites.current.catch(() => {});
    await api("/auth/session", "DELETE");
    accept(null);
    setError("");
  }
  if (checking)
    return (
      <main className="auth-page">
        <p role="status">{tr("opening_your_space")}</p>
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
      key={`${session.user_id}:${session.locale}`}
      value={{
        session,
        changeTheme: (theme) => changePreferences({ theme }),
        changeLocale: (locale) => changePreferences({ locale }),
        logout,
      }}
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
