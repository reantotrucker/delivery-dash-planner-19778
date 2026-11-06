import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InteriorDraft } from "@/lib/interiorDraft";
import type { Json } from "@/integrations/supabase/types";

export function useInteriorDraft(companyId: string, userId: string | undefined, pedidoId: string | undefined, version: string, enabled: boolean) {
  const key = `interior-draft:${companyId}:${userId}:${pedidoId}:${version}`;
  const [loaded, setLoaded] = useState<{ key: string; draft: InteriorDraft | null } | null>(null);
  const [status, setStatus] = useState("");
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (!enabled || !userId || !pedidoId || !companyId) return;
    let active = true;
    const load = async () => {
      let draft: InteriorDraft | null = null;
      try { draft = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* use cloud */ }
      const { data, error } = await supabase.from("interior_conference_drafts").select("base_version,data")
        .eq("company_id", companyId).eq("user_id", userId).eq("pedido_id", pedidoId).maybeSingle();
      if (!active) return;
      const remote = data?.base_version === version ? data.data as unknown as InteriorDraft : null;
      if (remote && (!draft || remote.updatedAt > draft.updatedAt)) draft = remote;
      setLoaded({ key, draft });
      setStatus(error ? "Não foi possível buscar o progresso salvo; mantido neste aparelho" : "");
    };
    void load();
    return () => { active = false; };
  }, [key, enabled, companyId, userId, pedidoId, version]);

  const persist = (draft: InteriorDraft) => {
    if (!enabled || !userId || !pedidoId || !companyId) return;
    let localSaved = false;
    try { localStorage.setItem(key, JSON.stringify(draft)); localSaved = true; } catch { /* report cloud failure below */ }
    setStatus("Salvando alterações…");
    queue.current = queue.current.catch(() => {}).then(async () => {
      const { error } = await supabase.from("interior_conference_drafts").upsert({
        company_id: companyId, user_id: userId, pedido_id: pedidoId,
        base_version: version, data: draft as unknown as Json, updated_at: draft.updatedAt,
      });
      setStatus(error ? (localSaved ? "Salvo neste aparelho; sem conexão para salvar na nuvem" : "Não foi possível salvar as alterações") : "Alterações salvas automaticamente");
    });
  };

  const clear = async () => {
    await queue.current;
    if (!userId || !pedidoId) return;
    const { error } = await supabase.from("interior_conference_drafts").delete()
      .eq("company_id", companyId).eq("user_id", userId).eq("pedido_id", pedidoId).eq("base_version", version);
    // A changed base version also prevents restoring a stale draft after confirmation.
    try { localStorage.removeItem(key); } catch { /* cloud is authoritative */ }
    setLoaded(null);
    setStatus(error ? "Conferência salva; não foi possível limpar o progresso anterior" : "");
  };

  return { ready: !enabled || loaded?.key === key, draft: loaded?.key === key ? loaded.draft : null, persist, clear, status };
}