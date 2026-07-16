import { useEffect, useState, useCallback } from "react";
import { sincronizarTodo } from "../sync/colaSync.js";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  const handleOnline = useCallback(() => {
    setOnline(true);
    // Drena la cola completa, en orden: apertura → pedidos → movimientos → cierre.
    // Sincronizar solo los pedidos dejaría fuera la apertura, y el servidor los
    // rechazaría todos con DIA_NO_ABIERTO.
    void sincronizarTodo();
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
