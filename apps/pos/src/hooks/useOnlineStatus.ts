import { useEffect, useState, useCallback } from "react";
import { sincronizarPendientes } from "../services/syncQueue.js";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  const handleOnline = useCallback(() => {
    setOnline(true);
    void sincronizarPendientes();
  }, []);

  const handleOffline = useCallback(() => setOnline(false), []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return online;
}
