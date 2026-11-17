import { useEffect } from "react";
import type { SettingsPanelProps } from "./definition";

export function useSettingsDraft(
  { onDirty, onBusy }: SettingsPanelProps,
  dirty: boolean,
  busy: boolean,
) {
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
}
