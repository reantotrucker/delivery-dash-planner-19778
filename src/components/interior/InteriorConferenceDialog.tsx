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
import { Loader2, Trash2, Save, Send, AlertTriangle, Undo2, Package, Printer, RotateCcw } from "lucide-react";
import { printInteriorLabel } from "@/lib/printInteriorLabel";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  const { isAdmin, isComercial, user } = useAuth();
  const [confirmReabrir, setConfirmReabrir] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState("");
  const [reabrindo, setReabrindo] = useState(false);
  const { data: meuNome } = useQuery({
    queryKey: ["meu-nome", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
      return (data?.full_name && data.full_name.trim()) || data?.email || user?.email || "";
    },
  });
  const [confirmPedidoDel, setConfirmPedidoDel] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [deleting, setDeleting] = useState(false);

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
  // Depois de enviado à Omie o Stock360 Vendas não aceita mais alterações
  const editavel = !!pedido && ["aguardando_conferencia", "conferido"].includes(pedido.status);
  const podeRefazer = !!pedido && pedido.status === "conferido" && !pedido.reaberto && (!isComercial || isAdmin);
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
  const volumesOk = /^\d+$/.test(volumes.trim()) && Number(volumes.trim()) >= 1;
  const canSend = pedido?.status === "conferido" && !dirty && volumesOk;

  const invalidQty = pedido
    ? (pedido.itens || []).some((i) => {
        if (removed.has(i.produto_id)) return false;
        const n = Number(String(qty[i.produto_id] ?? "").replace(",", "."));
        return isNaN(n) || n <= 0;
      })
    : false;

  const salvar = async () => {
    if (!pedido) return;
    // Volume é obrigatório: número inteiro maior que zero
    const volTxt = volumes.trim();
    if (volTxt === "") {
      toast.error("Informe a quantidade de volumes");
      return;
    }
    const v = Number(volTxt);
    if (isNaN(v) || v < 1 || !Number.isInteger(v)) {
      toast.error("Quantidade de volumes inválida");
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

  const refazerConferencia = async () => {
    if (!pedido) return;
    setReabrindo(true);
    try {
      await interiorCall({ acao: "reabrir", pedido_id: pedido.id, motivo: motivoReabrir.trim() || null });
      toast.success("O pedido voltou para Recebidos para conferir de novo");
      setConfirmReabrir(false);
      setMotivoReabrir("");
      qc.invalidateQueries({ queryKey: ["interior-lista"] });
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReabrindo(false);
    }
  };

  const excluirPedido = async () => {
    if (!pedido) return;
    setDeleting(true);
    try {
      await interiorCall({
        acao: "excluir",
        pedido_id: pedido.id,
        numero_pedido: pedido.numero_pedido,
        cliente: clienteNome(pedido),
        motivo: motivo.trim() || null,
      });
      toast.success(`Pedido ${pedido.numero_pedido ? `#${pedido.numero_pedido} ` : ""}excluído`);
      qc.invalidateQueries({ queryKey: ["interior-lista"] });
      qc.invalidateQueries({ queryKey: ["interior-relatorio"] });
      setConfirmPedidoDel(false);
      setMotivo("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
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
              <span className="text-xs text-muted-foreground truncate min-w-0 flex-1">{clienteNome(pedido)}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => {
                  const v = volumes.trim() === "" ? null : Number(volumes);
                  printInteriorLabel(pedido, v != null && Number.isInteger(v) ? v : null).catch((e) =>
                    toast.error((e as Error).message)
                  );
                }}
              >
                <Printer className="w-3.5 h-3.5 mr-1" /> Etiqueta
              </Button>
              {podeRefazer && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={() => setConfirmReabrir(true)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Refazer conferência
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmPedidoDel(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                </Button>
              )}
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
                {!editavel && <Info l="Volumes" v={pedido.qtd_volumes != null ? String(pedido.qtd_volumes) : "—"} />}
                <Info
                  l="Conferido por"
                  v={
                    pedido.interior_conferido_por
                      ? `${pedido.interior_conferido_por}${pedido.interior_conferido_em ? ` · ${fmtDateTime(pedido.interior_conferido_em)}` : ""}`
                      : "Ainda não conferido"
                  }
                  className={`sm:col-span-2 ${pedido.interior_conferido_por ? "border-primary/40 bg-primary/5" : ""}`}
                />
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
                            <div className="flex items-center gap-2 min-w-0">
                              <ProdutoFoto url={i.imagem_url} />
                              <div className="min-w-0">
                                <p
                                  className={`font-medium text-xs sm:text-sm leading-snug break-words ${isRemoved ? "line-through" : ""}`}
                                >
                                  {decodeHtml(i.descricao)}
                                </p>
                                <p className="text-[11px] text-muted-foreground break-words">
                                  {i.codigo_sku && (
                                    <span className="font-mono font-semibold text-foreground/80">Cód. {i.codigo_sku}</span>
                                  )}
                                  <span className="sm:hidden">
                                    {i.codigo_sku ? " · " : ""}
                                    {brl(i.preco_unitario)} un. ·{" "}
                                    <b className="tabular-nums">{brl(isRemoved ? 0 : n * (Number(i.preco_unitario) || 0))}</b>
                                  </span>
                                </p>
                                {changed && <p className="text-[11px] text-primary">Original: {i.quantidade}</p>}
                                {isRemoved && <p className="text-[11px] text-destructive">Excluído</p>}
                              </div>
                            </div>
                          </td>
                          <td className="p-1 sm:p-2 text-right align-middle">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              disabled={isRemoved || !editavel}
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
                            {!editavel ? null : isRemoved ? (
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

              {!editavel && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Este pedido já foi enviado à Omie
                  {pedido.interior_enviado_omie_em ? ` em ${fmtDateTime(pedido.interior_enviado_omie_em)}` : ""}. Aqui é
                  só para consulta; qualquer mudança agora precisa ser feita direto na Omie.
                </div>
              )}

              {pedido.reaberto && (
                <div className="rounded-lg border border-warning/60 bg-warning/15 p-3 text-xs">
                  <b>Conferência refeita</b>
                  {pedido.reaberto_por ? ` · pedida por ${pedido.reaberto_por}` : ""}
                  {pedido.reaberto_em ? ` em ${fmtDateTime(pedido.reaberto_em)}` : ""}
                  {pedido.reaberto_motivo ? ` · ${pedido.reaberto_motivo}` : ""}. Confira os itens e os volumes de
                  novo e toque em <b>Salvar</b>.
                </div>
              )}

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

        {pedido && editavel && (
          <div className="flex-shrink-0 border-t border-border bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="vol" className="text-xs">
                  Volumes <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="vol"
                  type="number"
                  min={1}
                  required
                  inputMode="numeric"
                  value={volumes}
                  onChange={(e) => setVolumes(e.target.value)}
                  aria-invalid={!volumesOk}
                  className={`h-10 w-24 sm:w-32 text-base sm:text-sm ${!volumesOk ? "border-destructive" : ""}`}
                />
              </div>
              <div className="text-right min-w-0">
                <p className="text-[10px] uppercase text-muted-foreground">Total conferido</p>
                <p className="text-lg font-bold tabular-nums whitespace-nowrap">{brl(totalAtual)}</p>
              </div>
            </div>
            {meuNome && (
              <p className="text-[11px] text-muted-foreground">
                Conferente: <b className="text-foreground">{meuNome}</b> (a conferência fica salva no seu nome)
              </p>
            )}
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
                title={!volumesOk ? "Informe a quantidade de volumes" : !canSend ? "Salve a conferência primeiro" : undefined}
                className="h-11 sm:h-10"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar p/ Omie
              </Button>
            </div>
          </div>
        )}

        <AlertDialog
          open={confirmPedidoDel}
          onOpenChange={(o) => {
            if (!o && !deleting) {
              setConfirmPedidoDel(false);
              setMotivo("");
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir pedido</AlertDialogTitle>
              <AlertDialogDescription>
                Deseja excluir o pedido {pedido?.numero_pedido ? `#${pedido.numero_pedido}` : ""} da Entrega para
                interior? Ele some da lista e dos relatórios.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1">
              <Label htmlFor="motivo" className="text-xs">
                Motivo (opcional)
              </Label>
              <Input
                id="motivo"
                value={motivo}
                maxLength={500}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: pedido duplicado"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" onClick={excluirPedido} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Excluir
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={confirmReabrir}
          onOpenChange={(o) => {
            if (!o && !reabrindo) {
              setConfirmReabrir(false);
              setMotivoReabrir("");
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Refazer conferência</AlertDialogTitle>
              <AlertDialogDescription>
                O pedido {pedido?.numero_pedido ? `#${pedido.numero_pedido}` : ""} volta para a aba Recebidos, marcado
                em amarelo, para ser conferido de novo. Ele só pode ser enviado à Omie depois de salvar a nova
                conferência.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1">
              <Label htmlFor="motivo-reabrir" className="text-xs">
                Motivo (opcional)
              </Label>
              <Input
                id="motivo-reabrir"
                value={motivoReabrir}
                maxLength={500}
                onChange={(e) => setMotivoReabrir(e.target.value)}
                placeholder="Ex.: item passou em branco, quantidade a mais"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reabrindo}>Cancelar</AlertDialogCancel>
              <Button onClick={refazerConferencia} disabled={reabrindo}>
                {reabrindo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                Refazer
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

function ProdutoFoto({ url }: { url?: string | null }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [url]);
  const temFoto = !!url && !falhou;
  return (
    <a
      href={temFoto ? url! : undefined}
      target="_blank"
      rel="noreferrer"
      title={temFoto ? "Ver foto maior" : "Sem foto"}
      className="shrink-0 w-10 h-10 rounded-md border border-border bg-muted overflow-hidden flex items-center justify-center"
      onClick={(e) => !temFoto && e.preventDefault()}
    >
      {temFoto ? (
        <img
          src={url!}
          alt=""
          width={40}
          height={40}
          decoding="async"
          referrerPolicy="no-referrer"
          className="block w-full h-full object-contain bg-background"
          onError={() => setFalhou(true)}
        />
      ) : (
        <Package className="w-4 h-4 text-muted-foreground" />
      )}
    </a>
  );
}
