import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { PackageCheck, Store, Truck, ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface TvOrder {
  id: string;
  doc_type: string;
  doc_number: string | null;
  client: string;
  neighborhood: string | null;
  total_value: number | null;
  status: "AGUARDANDO" | "BALCAO" | "ROTA";
  created_at: string;
  checked_at: string | null;
  checked_by: string | null;
}

const formatBRL = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const beep = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* ignore */
  }
};

export default function TvPanel() {
  const { companies, companyId: activeCompanyId, selectCompany } = useCompany();
  const [searchParams] = useSearchParams();
  const urlCompanyId = searchParams.get("company") || "";
  const queryClient = useQueryClient();
  const [sound, setSound] = useState(true);
  const [lastCount, setLastCount] = useState<number | null>(null);

  // A empresa pode vir pela URL (painel aberto em nova aba)
  useEffect(() => {
    if (urlCompanyId && urlCompanyId !== activeCompanyId && companies.some((c) => c.id === urlCompanyId)) {
      selectCompany(urlCompanyId);
    }
  }, [urlCompanyId, activeCompanyId, companies, selectCompany]);

  const companyId = urlCompanyId || activeCompanyId;
  const company = companies.find((c) => c.id === companyId) || null;
  const hasExpedition = !!company?.has_expedition;

  const [today, setToday] = useState(todayStr());

  // Mantém o painel sempre no dia atual (virada de dia)
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayStr();
      setToday((prev) => (prev === t ? prev : t));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const { data: orders = [] } = useQuery({
    queryKey: ["tv-orders", companyId, today],
    enabled: !!companyId && hasExpedition,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedition_orders")
        .select("id, doc_type, doc_number, client, neighborhood, total_value, status, created_at, checked_at, checked_by")
        .eq("company_id", companyId)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) throw error;
      return (data || []) as TvOrder[];
    },
  });

  // Realtime updates
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("tv-expedition")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expedition_orders" },
        () => queryClient.invalidateQueries({ queryKey: ["tv-orders"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  // Pendentes: só saem da tela quando o expedidor confirma Balcão ou Rota (ordem de chegada)
  const pending = useMemo(
    () =>
      orders
        .filter((o) => o.status === "AGUARDANDO")
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [orders]
  );
  const done = useMemo(() => orders.filter((o) => o.status !== "AGUARDANDO").slice(0, 8), [orders]);

  // Cards que acabaram de ser finalizados: ficam em tela desintegrando
  const prevStatus = useRef<Map<string, string>>(new Map());
  const prevOrders = useRef<TvOrder[]>([]);
  const [leaving, setLeaving] = useState<TvOrder[]>([]);
  useEffect(() => {
    if (!orders.length) return;
    const gone: TvOrder[] = [];
    for (const o of orders) {
      const before = prevStatus.current.get(o.id);
      if (before === "AGUARDANDO" && o.status !== "AGUARDANDO") gone.push(o);
    }
    // pedidos que sumiram da consulta mas estavam aguardando
    const currentIds = new Set(orders.map((o) => o.id));
    prevOrders.current.forEach((o) => {
      if (!currentIds.has(o.id) && o.status === "AGUARDANDO") gone.push(o);
    });
    prevOrders.current = orders;
    prevStatus.current = new Map(orders.map((o) => [o.id, o.status]));
    if (gone.length) {
      setLeaving((l) => [...l, ...gone.filter((g) => !l.some((x) => x.id === g.id))]);
      const goneIds = new Set(gone.map((g) => g.id));
      setTimeout(() => setLeaving((l) => l.filter((o) => !goneIds.has(o.id))), 4200);
    }
  }, [orders]);

  const display = useMemo(() => {
    const ids = new Set(pending.map((o) => o.id));
    return [...pending, ...leaving.filter((o) => !ids.has(o.id))].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [pending, leaving]);


  useEffect(() => {
    if (lastCount !== null && pending.length > lastCount && sound) beep();
    setLastCount(pending.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

  if (!hasExpedition) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-xl text-muted-foreground">
          A empresa {company?.name} não utiliza o painel de expedição.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PackageCheck className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-4xl font-black tracking-tight">SEPARAR PEDIDOS</h1>
            <p className="text-lg text-muted-foreground">{company?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="text-2xl px-5 py-2">{pending.length} pendente(s)</Badge>
          <Button variant="outline" size="icon" onClick={() => setSound((s) => !s)} aria-label="Som">
            {sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
          <Button variant="outline" size="icon" asChild aria-label="Voltar">
            <Link to="/">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </header>

      {display.length === 0 ? (
        <div className="flex items-center justify-center h-[50vh] text-4xl font-bold text-muted-foreground">
          Nenhum pedido aguardando separação
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {display.map((o) => {
            const isLeaving = !pending.some((p) => p.id === o.id);
            const inConference = !!o.checked_by;
            return (
              <div
                key={o.id}
                className={cn(
                  "rounded-2xl border-4 bg-card p-5 transition-colors duration-500",
                  inConference ? "border-success bg-success/10" : "border-primary",
                  !inConference && !isLeaving && o.id === pending[0]?.id && "animate-pulse",
                  isLeaving && "tv-disintegrate border-destructive bg-destructive/10"
                )}
              >
                <p className="text-sm font-semibold text-muted-foreground">
                  {o.doc_type} {o.doc_number} · {format(new Date(o.created_at), "dd/MM HH:mm")}
                </p>
                <p className="text-3xl font-black leading-tight mt-1 break-words">{o.client}</p>
                {o.neighborhood && <p className="text-xl text-muted-foreground mt-1">{o.neighborhood}</p>}
                <p className="text-2xl font-bold mt-2">{formatBRL(o.total_value)}</p>
                {isLeaving && (
                  <p className="mt-3 text-3xl font-black text-destructive tracking-widest">
                    {o.status === "BALCAO" ? "BALCÃO ✓" : "ROTA ✓"}
                  </p>
                )}
                {!isLeaving && inConference && (
                  <p className="mt-3 inline-flex items-center gap-2 text-lg font-bold text-success">
                    <PackageCheck className="w-5 h-5" /> EM CONFERÊNCIA
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}


      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-muted-foreground mb-3">Concluídos recentes</h2>
          <div className="flex flex-wrap gap-3">
            {done.map((o) => (
              <div
                key={o.id}
                className={cn(
                  "rounded-xl px-4 py-3 border-2",
                  o.status === "BALCAO"
                    ? "border-success bg-success/10"
                    : "border-primary bg-primary/10"
                )}
              >
                <p className="font-bold text-lg">{o.client}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  {o.status === "BALCAO" ? (
                    <>
                      <Store className="w-4 h-4" /> Venda balcão
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4" /> Enviado para rota
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
