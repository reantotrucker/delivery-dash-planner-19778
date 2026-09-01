import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Eraser, Loader2, PenLine, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface Signature {
  id: string;
  file_path: string;
  signer_name: string;
  signer_document: string | null;
  signed_at: string;
  created_by: string | null;
}

interface Props {
  routeId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canSign: boolean;
  /** Called after a signature is successfully saved */
  onSaved?: () => void;
}

export const RouteSignatureDialog = ({
  routeId,
  clientName,
  open,
  onOpenChange,
  canSign,
  onSaved,
}: Props) => {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [signerName, setSignerName] = useState("");
  const [signerDocument, setSignerDocument] = useState("");
  const [saving, setSaving] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const { data: signatures = [], refetch } = useQuery({
    queryKey: ["route-signatures", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_signatures")
        .select("*")
        .eq("route_id", routeId)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return data as Signature[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open || signatures.length === 0) return;
    (async () => {
      const paths = signatures.map((s) => s.file_path);
      const { data } = await supabase.storage.from("route-signatures").createSignedUrls(paths, 3600);
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) map[paths[i]] = d.signedUrl;
      });
      setSignedUrls(map);
    })();
  }, [signatures, open]);

  // Prepare canvas (hi-dpi) when dialog opens
  useEffect(() => {
    if (!open) return;
    setSignerName("");
    setSignerDocument("");
    hasStrokeRef.current = false;
    const id = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
      ctx.clearRect(0, 0, rect.width, rect.height);
    });
    return () => cancelAnimationFrame(id);
  }, [open, canSign]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };

  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasStrokeRef.current = false;
  };

  const saveSignature = async () => {
    if (!hasStrokeRef.current) {
      toast({ title: "Peça para o cliente assinar na tela", variant: "destructive" });
      return;
    }
    if (!signerName.trim()) {
      toast({ title: "Informe o nome de quem assinou", variant: "destructive" });
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      // Flatten onto white background for readability
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d");
      if (!fctx) throw new Error("Canvas indisponível");
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);

      const blob: Blob = await new Promise((resolve, reject) =>
        flat.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))), "image/png")
      );

      const path = `${routeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: upErr } = await supabase.storage
        .from("route-signatures")
        .upload(path, blob, { contentType: "image/png" });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("route_signatures").insert({
        route_id: routeId,
        file_path: path,
        signer_name: signerName.trim(),
        signer_document: signerDocument.trim() || null,
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast({ title: "Assinatura salva!" });
      clearCanvas();
      setSignerName("");
      setSignerDocument("");
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["route-signature-counts"] });
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao salvar assinatura", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const removeSignature = async (sig: Signature) => {
    try {
      await supabase.storage.from("route-signatures").remove([sig.file_path]);
      const { error } = await supabase.from("route_signatures").delete().eq("id", sig.id);
      if (error) throw error;
      toast({ title: "Assinatura excluída" });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["route-signature-counts"] });
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5" />
            Assinatura do cliente
          </DialogTitle>
          <DialogDescription>
            {clientName} — o cliente assina com o dedo na tela do celular e a assinatura fica guardada no sistema.
          </DialogDescription>
        </DialogHeader>

        {canSign && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="signer-name" className="text-xs">Nome de quem recebeu</Label>
                <Input
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="signer-doc" className="text-xs">CPF / RG (opcional)</Label>
                <Input
                  id="signer-doc"
                  value={signerDocument}
                  onChange={(e) => setSignerDocument(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Assine no quadro abaixo</Label>
              <canvas
                ref={canvasRef}
                className="mt-1 w-full h-48 rounded-lg border-2 border-dashed border-border bg-white touch-none"
                onPointerDown={startDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                onPointerCancel={endDraw}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={clearCanvas} disabled={saving} className="flex-1">
                <Eraser className="w-4 h-4 mr-1" />
                Limpar
              </Button>
              <Button onClick={saveSignature} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PenLine className="w-4 h-4 mr-1" />}
                Salvar assinatura
              </Button>
            </div>
          </div>
        )}

        {signatures.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Assinaturas registradas
            </p>
            {signatures.map((sig) => (
              <div key={sig.id} className="rounded-lg border border-border p-2 space-y-2">
                {signedUrls[sig.file_path] ? (
                  <img
                    src={signedUrls[sig.file_path]}
                    alt={`Assinatura de ${sig.signer_name}`}
                    className="w-full rounded bg-white"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
                    Carregando...
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{sig.signer_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {sig.signer_document ? `${sig.signer_document} · ` : ""}
                      {new Date(sig.signed_at).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
                    </p>
                  </div>
                  {(isAdmin || sig.created_by === user?.id) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0"
                      onClick={() => removeSignature(sig)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!canSign && signatures.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhuma assinatura registrada para esta entrega.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
