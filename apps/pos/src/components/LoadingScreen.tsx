interface LoadingScreenProps {
  mensaje: string;
  error?: string;
  onRetry?: () => void;
}

export function LoadingScreen({ mensaje, error, onRetry }: LoadingScreenProps) {
  return (
    <div style={styles.container}>
      <h1 style={styles.titulo}>Las Brasas</h1>
      {error ? (
        <>
          <p style={styles.error}>{error}</p>
          {onRetry && (
            <button style={styles.boton} onClick={onRetry}>
              Reintentar
            </button>
          )}
        </>
      ) : (
        <p style={styles.mensaje}>{mensaje}</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    backgroundColor: "#1a1a1a",
    color: "#ffffff",
    fontFamily: "sans-serif",
    gap: "1rem",
  },
  titulo: {
    fontSize: "2rem",
    fontWeight: "bold",
    margin: 0,
  },
  mensaje: {
    fontSize: "1rem",
    color: "#aaaaaa",
    margin: 0,
  },
  error: {
    fontSize: "1rem",
    color: "#ff6b6b",
    margin: 0,
    textAlign: "center",
    maxWidth: "400px",
  },
  boton: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#e84b1a",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    cursor: "pointer",
  },
};
