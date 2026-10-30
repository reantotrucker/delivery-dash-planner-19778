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
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Conferência do pedido {pedido?.numero_pedido ? `#${pedido.numero_pedido}` : ""}
            {pedido && <Badge variant="outline">{STATUS_LABEL[pedido.status] || pedido.status}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {pedido && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Info l="Cliente" v={clienteNome(pedido)} />
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
                <p className="whitespace-pre-wrap">{pedido.observacao}</p>
              </div>
            )}

            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Produto</th>
                    <th className="text-right p-2 w-28">Qtd.</th>
                    <th className="text-right p-2 hidden sm:table-cell">Unit.</th>
                    <th className="text-right p-2 hidden sm:table-cell">Total</th>
                    <th className="p-2 w-12" />
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
                        className={`border-t border-border ${idx % 2 ? "bg-muted/30" : ""} ${isRemoved ? "opacity-50 line-through" : ""}`}
                      >
                        <td className="p-2">
                          <p className="font-medium">{i.descricao}</p>
                          {i.codigo_sku && <p className="text-xs text-muted-foreground">{i.codigo_sku}</p>}
                          {changed && (
                            <p className="text-xs text-primary no-underline">Original: {i.quantidade}</p>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            disabled={isRemoved}
                            value={qty[i.produto_id] ?? ""}
                            onChange={(e) => setQty((q) => ({ ...q, [i.produto_id]: e.target.value }))}
                            className={`h-9 w-24 ml-auto text-right tabular-nums ${changed ? "border-primary" : ""}`}
                          />
                        </td>
                        <td className="p-2 text-right tabular-nums hidden sm:table-cell">{brl(i.preco_unitario)}</td>
                        <td className="p-2 text-right tabular-nums hidden sm:table-cell">
                          {brl(isRemoved ? 0 : n * (Number(i.preco_unitario) || 0))}
                        </td>
                        <td className="p-2 text-center">
                          {isRemoved ? (
                            <Button
                              size="icon"
                              variant="ghost"
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
                              className="text-destructive hover:text-destructive"
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
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td className="p-2" colSpan={3}>
                      Total conferido
                    </td>
                    <td className="p-2 text-right tabular-nums" colSpan={2}>
                      {brl(totalAtual)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="vol">Quantidade de volumes</Label>
                <Input
                  id="vol"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={volumes}
                  onChange={(e) => setVolumes(e.target.value)}
                  className="h-10 w-32"
                />
              </div>
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button onClick={salvar} disabled={saving || sending}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Salvar conferência
                </Button>
                <Button
                  variant="secondary"
                  onClick={enviar}
                  disabled={!canSend || sending || saving}
                  title={!canSend ? "Salve a conferência primeiro" : undefined}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                  Enviar para Omie
                </Button>
              </div>
            </div>
            {dirty && (
              <p className="text-xs text-muted-foreground">
                Há alterações não salvas. Salve a conferência para liberar o envio para a Omie.
              </p>
            )}

            {omieError && (
              <div className="flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Erro da Omie</p>
                  <p className="whitespace-pre-wrap">{omieError}</p>
                </div>
              </div>
            )}

            {historico.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground">Histórico</p>
                <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                  {historico.map((h: any, k: number) => (
                    <li key={h.id || k} className="border-l-2 border-border pl-2">
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

function Info({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-lg border border-border p-2 min-w-0">
      <p className="text-[10px] uppercase text-muted-foreground">{l}</p>
      <p className="font-medium truncate" title={v}>
        {v}
      </p>
    </div>
  );
}
