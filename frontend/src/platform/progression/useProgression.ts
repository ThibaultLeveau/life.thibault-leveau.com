import { useEffect, useState } from "react";
import { useSession } from "../auth/SessionProvider";
export function useProgressionRevision() {
  const [revision, setRevision] = useState(0);
  const { session } = useSession();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => setRevision((r) => r + 1), 100);
    };
    window.addEventListener("life-data-changed", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("life-data-changed", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return `${session.locale}:${revision}`;
}
