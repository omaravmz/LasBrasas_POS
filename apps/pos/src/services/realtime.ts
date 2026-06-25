import { supabase } from "../lib/supabase.js";

// Suscribe a cambios en la tabla Pedido filtrados por sucursal.
// Llama onCambio() cada vez que un pedido se inserta o actualiza.
// Retorna una función para cancelar la suscripción.
export function suscribirPedidos(
  sucursalId: string,
  onCambio: () => void
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`pedidos-${sucursalId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "Pedido",
        filter: `sucursalId=eq.${sucursalId}`,
      },
      onCambio
    )
    .subscribe();

  return () => {
    void supabase!.removeChannel(channel);
  };
}
