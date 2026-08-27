import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { PackageCheck, Store, ArrowLeft, Volume2, VolumeX, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import moneySfx from "@/assets/money-soundfx.mp3.asset.json";


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
  delivered_at: string | null;
}

const formatBRL = (v?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

let audioEl: HTMLAudioElement | null = null;
const beep = () => {
  try {
    if (!audioEl) {
      audioEl = new Audio(moneySfx.url);
      audioEl.volume = 1;
    }
    audioEl.currentTime = 0;
    void audioEl.play();
  } catch {
    /* ignore */
  }
};


const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
        .select("id, doc_type, doc_number, client, neighborhood, total_value, status, created_at, checked_at, checked_by, delivered_at")
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
  // Balcão conferido, aguardando o cliente retirar
  const counter = useMemo(
    () =>
      orders
        .filter((o) => o.status === "BALCAO" && !o.delivered_at)
        .sort((a, b) => new Date(a.checked_at || a.created_at).getTime() - new Date(b.checked_at || b.created_at).getTime()),
    [orders]
  );
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
    <div className="min-h-screen bg-background text-foreground p-3">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <PackageCheck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-black tracking-tight">SEPARAR PEDIDOS</h1>
            <p className="text-sm text-muted-foreground">{company?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="text-xl px-4 py-1">{pending.length} separando</Badge>
          <Badge variant="outline" className="text-xl px-4 py-1 border-success text-success">
            {counter.length} balcão
          </Badge>
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

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        {/* Lado esquerdo: em separação */}
        <section className="rounded-xl border-2 border-border p-2">
          <h2 className="text-xl font-black mb-3 flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-primary" /> EM SEPARAÇÃO
          </h2>

          {display.length === 0 ? (
            <div className="flex items-center justify-center h-[22vh] text-xl font-bold text-muted-foreground text-center">
              Nenhum pedido aguardando separação
            </div>
          ) : (
            <div className="grid gap-1.5 grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {display.map((o) => {
                const isLeaving = !pending.some((p) => p.id === o.id);
                const inConference = !!o.checked_by;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      "rounded-lg border-2 bg-card p-2 transition-colors duration-500",
                      inConference ? "border-success bg-success/10" : "border-primary",
                      !inConference && !isLeaving && o.id === pending[0]?.id && "animate-pulse",
                      isLeaving && "tv-disintegrate border-destructive bg-destructive/10"
                    )}
                  >
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {o.doc_type} {o.doc_number} · {format(new Date(o.created_at), "dd/MM HH:mm")}
                    </p>
                    <p className="text-base font-black leading-tight mt-0.5 break-words line-clamp-2">{o.client}</p>
                    {o.neighborhood && (
                      <p className="text-xs text-muted-foreground truncate">{o.neighborhood}</p>
                    )}
                    <p className="text-sm font-bold mt-0.5">{formatBRL(o.total_value)}</p>
                    {isLeaving && (
                      <p className="mt-1 text-lg font-black text-destructive tracking-wider">
                        {o.status === "BALCAO" ? "BALCÃO ✓" : "ROTA ✓"}
                      </p>
                    )}
                    {!isLeaving && inConference && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-success">
                        <PackageCheck className="w-4 h-4" /> EM CONFERÊNCIA
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Lado direito: separado para balcão, aguardando o cliente */}
        <section className="rounded-xl border-2 border-success/40 bg-success/5 p-3">
          <h2 className="text-xl font-black mb-3 flex items-center gap-2 text-success">
            <Store className="w-5 h-5" /> SEPARADO · BALCÃO
          </h2>

          {counter.length === 0 ? (
            <div className="flex items-center justify-center h-[22vh] text-xl font-bold text-muted-foreground text-center">
              Nenhum pedido aguardando o cliente
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {counter.map((o) => (
                <div
                  key={o.id}
                  className="rounded-lg border-2 border-success bg-card p-3"
                >
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {o.doc_type} {o.doc_number} ·{" "}
                    {format(new Date(o.checked_at || o.created_at), "dd/MM HH:mm")}
                  </p>
                  <p className="text-base font-black leading-tight mt-0.5 break-words line-clamp-2">{o.client}</p>
                  {o.neighborhood && (
                    <p className="text-xs text-muted-foreground truncate">{o.neighborhood}</p>
                  )}
                  <p className="text-sm font-bold mt-0.5">{formatBRL(o.total_value)}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-success">
                    <HandCoins className="w-4 h-4" /> PRONTO · AGUARDANDO CLIENTE
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>


    </div>
  );
}

