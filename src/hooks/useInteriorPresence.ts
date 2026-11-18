import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Meta = { user_id: string; nome: string; pedido_id: string | null; desde: string };

/** Mostra em tempo real quem está com cada pedido do interior aberto (sem gravar nada). */
export function useInteriorPresence(companyId: string | null | undefined, userId: string | undefined, nome: string, pedidoAberto: string | null) {
  const [mapa, setMapa] = useState<Record<string, { nome: string; desde: string }[]>>({});
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const atual = useRef<Meta | null>(null);

  useEffect(() => {
    if (!companyId || !userId) return;
    const ch = supabase.channel(`interior-conferencia-${companyId}`, { config: { presence: { key: userId } } });
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<Meta>();
      const m: Record<string, { nome: string; desde: string }[]> = {};
      Object.values(st).flat().forEach((p) => {
        if (!p.pedido_id || p.user_id === userId) return;
        (m[p.pedido_id] ||= []).push({ nome: p.nome, desde: p.desde });
      });
      setMapa(m);
    }).subscribe((s) => {
      if (s === "SUBSCRIBED" && atual.current) ch.track(atual.current);
    });
    chRef.current = ch;
    return () => {
      chRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [companyId, userId]);

  useEffect(() => {
    if (!userId) return;
    atual.current = { user_id: userId, nome: nome || "Alguém", pedido_id: pedidoAberto, desde: new Date().toISOString() };
    chRef.current?.track(atual.current);
  }, [pedidoAberto, nome, userId]);

  return mapa;
}
