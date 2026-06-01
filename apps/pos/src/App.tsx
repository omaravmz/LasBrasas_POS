import { useEffect, useState } from "react";
import { LoadingScreen } from "./components/LoadingScreen.js";
import { PantallaPOS } from "./components/PantallaPOS.js";
import { syncCatalog, getLastSyncTime } from "./sync/catalogSync.js";

type AppState = "cargando" | "sincronizando" | "listo" | "error";

export function App() {
  const [appState, setAppState] = useState<AppState>("cargando");
  const [error, setError] = useState<string | null>(null);

  const inicializar = async () => {
    setError(null);
    setAppState("cargando");

    try {
      // Si hay catálogo local, mostramos la app de inmediato y sync en background
      const lastSync = await getLastSyncTime();

      if (!lastSync) {
        // Primera carga: necesitamos sincronizar antes de mostrar nada
        setAppState("sincronizando");
        await syncCatalog();
      } else {
        // Ya tenemos datos locales — arrancar de inmediato, sync silencioso
        setAppState("listo");
        syncCatalog().catch(console.warn);
      }

      setAppState("listo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al conectar con el servidor";
      setError(msg);
      setAppState("error");
    }
  };

  useEffect(() => {
    void inicializar();
  }, []);

  if (appState === "cargando") {
    return <LoadingScreen mensaje="Iniciando..." />;
  }

  if (appState === "sincronizando") {
    return <LoadingScreen mensaje="Descargando catálogo..." />;
  }

  if (appState === "error") {
    return (
      <LoadingScreen
        mensaje=""
        error={error ?? "Error desconocido"}
        onRetry={() => void inicializar()}
      />
    );
  }

  return <PantallaPOS />;
}
