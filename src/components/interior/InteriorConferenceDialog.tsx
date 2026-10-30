import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Save, Send, AlertTriangle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  interiorCall,
  InteriorPedido,
  STATUS_LABEL,
  brl,
  clienteNome,
  decodeHtml,
  fmtDateTime,
} from "@/lib/interior";

interface Props {
  pedidoId: string | null;
  onClose: () => void;
}

export function InteriorConferenceDialog({ pedidoId, onClose }: Props) {
  const qc = useQueryClient();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [volumes, setVolumes] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [omieError, setOmieError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["interior-detalhe", pedidoId],
    enabled: !!pedidoId,
    queryFn: () =>
      interiorCall<{ pedido: InteriorPedido; historico: any[] }>({
        acao: "detalhe",
        pedido_id: pedidoId,
      }),
  });

  const pedido = data?.pedido;
  const historico = data?.historico || [];

  useEffect(() => {
    if (!pedido) return;
    const q: Record<string, string> = {};
    (pedido.itens || []).forEach((i) => (q[i.produto_id] = String(i.quantidade ?? "")));
    setQty(q);
    setRemoved(new Set());
    setVolumes(pedido.qtd_volumes != null ? String(pedido.qtd_volumes) : "");
    setOmieError(pedido.erro_omie_mensagem || null);
  }, [pedido]);

  const alteracoes = useMemo(() => {
    if (!pedido) return [];
    const out: { produto_id: string; quantidade: number | null }[] = [];
    (pedido.itens || []).forEach((i) => {
      if (removed.has(i.produto_id)) {
        out.push({ produto_id: i.produto_id, quantidade: null });
        return;
      }
      const n = Number(String(qty[i.produto_id] ?? "").replace(",", "."));
      if (!isNaN(n) && n !== Number(i.quantidade)) out.push({ produto_id: i.produto_id, quantidade: n });
    });
    return out;
  }, [pedido, qty, removed]);

  const volumesDirty = pedido ? String(pedido.qtd_volumes ?? "") !== volumes : false;
  const dirty = alteracoes.length > 0 || volumesDirty;
  const canSend = pedido?.status === "conferido" && !dirty;

  const invalidQty = pedido
    ? (pedido.itens || []).some((i) => {
        if (removed.has(i.produto_id)) return false;
        const n = Number(String(qty[i.produto_id] ?? "").replace(",", "."));
        return isNaN(n) || n <= 0;
      })
    : false;

  const salvar = async () => {
    if (!pedido) return;
    const v = Number(volumes);
    if (!volumes || isNaN(v) || v < 0 || !Number.isInteger(v)) {
      toast.error("Informe a quantidade de volumes");
      return;
    }
    if (invalidQty) {
      toast.error("Há itens com quantidade inválida");
      return;
    }
    setSaving(true);
    try {
      await interiorCall({
        acao: "salvar_conferencia",
        pedido_id: pedido.id,
        qtd_volumes: v,
        alteracoes,
      });
      toast.success("Conferência salva");
      await refetch();
      qc.invalidateQueries({ queryKey: ["interior-lista"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const enviar = async () => {
    if (!pedido) return;
    setSending(true);
    setOmieError(null);
    try {
      const r = await interiorCall<{ success: boolean; codigo_pedido_omie?: string; error?: string }>({
        acao: "enviar_omie",
        pedido_id: pedido.id,
      });
      if (r?.success) {
        toast.success(`Enviado para a Omie${r.codigo_pedido_omie ? ` · pedido ${r.codigo_pedido_omie}` : ""}`);
        await refetch();
        qc.invalidateQueries({ queryKey: ["interior-lista"] });
      } else {
        setOmieError(r?.error || "A Omie recusou o pedido");
      }
    } catch (e) {
      setOmieError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const itens = pedido?.itens || [];
  const totalAtual = itens.reduce((s, i) => {
    if (removed.has(i.produto_id)) return s;
    const n = Number(String(qty[i.produto_id] ?? "").replace(",", ".")) || 0;
    return s + n * (Number(i.preco_unitario) || 0);
  }, 0);

  return (
    <Dialog open={!!pedidoId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col gap-0 p-0 w-full max-w-4xl h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-lg border-0 sm:border overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 pr-12 sm:px-6 sm:pt-6 border-b border-border text-left space-y-1 flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg leading-tight">
            Conferência do pedido {pedido?.numero_pedido ? `#${pedido.numero_pedido}` : ""}
          </DialogTitle>
          {pedido && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                {STATUS_LABEL[pedido.status] || pedido.status}
              </Badge>
              <span className="text-xs text-muted-foreground truncate min-w-0">{clienteNome(pedido)}</span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-6 sm:py-4">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

          {pedido && (
            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <Info l="Cliente" v={clienteNome(pedido)} className="col-span-2 sm:col-span-1" />
                <Info l="Cidade" v={[pedido.clientes?.cidade, pedido.clientes?.uf].filter(Boolean).join(" / ") || "—"} />
                <Info l="Vendedor" v={pedido.vendedor_nome || "—"} />
                <Info l="Transporte" v={pedido.transporte_interior || "—"} />
                <Info l="Pagamento" v={pedido.forma_pagamento || "—"} />
                <Info l="Recebido" v={fmtDateTime(pedido.interior_recebido_em)} />
                <Info l="Pedido Omie" v={pedido.numero_pedido_omie ? String(pedido.numero_pedido_omie) : "—"} />
                <Info l="NF-e" v={pedido.numero_nfe || "—"} />
              </div>
              {pedido.observacao && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <span className="text-xs uppercase text-muted-foreground">Observação</span>
                  <p className="whitespace-pre-wrap break-words">{decodeHtml(pedido.observacao)}</p>
                </div>
              )}

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm table-fixed sm:table-auto">
                  <thead className="bg-muted/50 text-[10px] sm:text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Produto ({itens.length})</th>
                      <th className="text-right p-2 w-[76px] sm:w-28">Qtd.</th>
                      <th className="text-right p-2 hidden sm:table-cell">Unit.</th>
                      <th className="text-right p-2 hidden sm:table-cell">Total</th>
                      <th className="p-1 w-10 sm:w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i, idx) => {
                      const isRemoved = removed.has(i.produto_id);
                      const n = Number(String(qty[i.produto_id] ?? "").replace(",", ".")) || 0;
                      const changed = !isRemoved && n !== Number(i.quantidade);
                      return (
                        <tr
                          key={i.produto_id}
                          className={`border-t border-border ${idx % 2 ? "bg-muted/30" : ""} ${isRemoved ? "opacity-50" : ""}`}
                        >
                          <td className="p-2 align-middle min-w-0">
                            <p
                              className={`font-medium text-xs sm:text-sm leading-snug break-words ${isRemoved ? "line-through" : ""}`}
                            >
                              {decodeHtml(i.descricao)}
                            </p>
                            <p className="text-[11px] text-muted-foreground break-words">
                              {i.codigo_sku && <span>{i.codigo_sku}</span>}
                              <span className="sm:hidden">
                                {i.codigo_sku ? " · " : ""}
                                {brl(i.preco_unitario)} un. ·{" "}
                                <b className="tabular-nums">{brl(isRemoved ? 0 : n * (Number(i.preco_unitario) || 0))}</b>
                              </span>
                            </p>
                            {changed && <p className="text-[11px] text-primary">Original: {i.quantidade}</p>}
                            {isRemoved && <p className="text-[11px] text-destructive">Excluído</p>}
                          </td>
                          <td className="p-1 sm:p-2 text-right align-middle">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              disabled={isRemoved}
                              value={qty[i.produto_id] ?? ""}
                              onChange={(e) => setQty((q) => ({ ...q, [i.produto_id]: e.target.value }))}
                              className={`h-10 sm:h-9 w-full sm:w-24 ml-auto px-2 text-right tabular-nums text-base sm:text-sm ${changed ? "border-primary" : ""}`}
                            />
                          </td>
                          <td className="p-2 text-right tabular-nums hidden sm:table-cell">{brl(i.preco_unitario)}</td>
                          <td className="p-2 text-right tabular-nums hidden sm:table-cell">
                            {brl(isRemoved ? 0 : n * (Number(i.preco_unitario) || 0))}
                          </td>
                          <td className="p-1 text-center align-middle">
                            {isRemoved ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9"
                                title="Desfazer exclusão"
                                onClick={() =>
                                  setRemoved((s) => {
                                    const n2 = new Set(s);
                                    n2.delete(i.produto_id);
                                    return n2;
                                  })
                                }
                              >
                                <Undo2 className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                title="Excluir item"
                                onClick={() => setConfirmDel(i.produto_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {omieError && (
                <div className="flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">Erro da Omie</p>
                    <p className="whitespace-pre-wrap break-words">{omieError}</p>
                  </div>
                </div>
              )}

              {historico.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs uppercase text-muted-foreground">Histórico</p>
                  <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                    {historico.map((h: any, k: number) => (
                      <li key={h.id || k} className="border-l-2 border-border pl-2 break-words">
                        <span className="text-muted-foreground">{fmtDateTime(h.created_at || h.quando)}</span>{" "}
                        {h.usuario || h.quem ? <b>{h.usuario || h.quem}</b> : null}{" "}
                        {h.descricao || h.acao || h.evento || h.mensagem || ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {pedido && (
          <div className="flex-shrink-0 border-t border-border bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="vol" className="text-xs">
                  Volumes
                </Label>
                <Input
                  id="vol"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={volumes}
                  onChange={(e) => setVolumes(e.target.value)}
                  className="h-10 w-24 sm:w-32 text-base sm:text-sm"
                />
              </div>
              <div className="text-right min-w-0">
                <p className="text-[10px] uppercase text-muted-foreground">Total conferido</p>
                <p className="text-lg font-bold tabular-nums whitespace-nowrap">{brl(totalAtual)}</p>
              </div>
            </div>
            {dirty && (
              <p className="text-[11px] text-muted-foreground">
                Há alterações não salvas. Salve a conferência para liberar o envio para a Omie.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button onClick={salvar} disabled={saving || sending} className="h-11 sm:h-10">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                <span className="sm:hidden">Salvar</span>
                <span className="hidden sm:inline">Salvar conferência</span>
              </Button>
              <Button
                variant="secondary"
                onClick={enviar}
                disabled={!canSend || sending || saving}
                title={!canSend ? "Salve a conferência primeiro" : undefined}
                className="h-11 sm:h-10"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar p/ Omie
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir item</AlertDialogTitle>
              <AlertDialogDescription>Deseja excluir este item do pedido?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDel) setRemoved((s) => new Set(s).add(confirmDel));
                  setConfirmDel(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function Info({ l, v, className = "" }: { l: string; v: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-border p-2 min-w-0 ${className}`}>
      <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
      <p className="font-medium truncate" title={v}>
        {v}
      </p>
    </div>
  );
}
