import { useEffect, useState } from "react";
import { Route } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCity, getActiveCompanyId } from "@/lib/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Printer, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  route: Route | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  onSaved: () => void;
}

const extractNf = (observation?: string | null) => {
  const m = observation?.match(/NF\s*[:\-]?\s*([0-9.]+)/i);
  return m ? m[1] : "";
};

export const RouteVolumeDialog = ({ route, open, onOpenChange, canEdit, onSaved }: Props) => {
  const [volumes, setVolumes] = useState("");
  const [nfeNumber, setNfeNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!route) return;
    setVolumes(route.volumes ? String(route.volumes) : "");
    setNfeNumber(route.nfe_number || extractNf(route.observation));
  }, [route]);

  const save = async () => {
    if (!route) return;
    const qty = Number(volumes);
    if (!volumes || !Number.isInteger(qty) || qty < 1 || qty > 999) {
      toast({ title: "Volume inválido", description: "Informe um número inteiro entre 1 e 999.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("routes")
      .update({ volumes: qty, nfe_number: nfeNumber.trim() || null })
      .eq("id", route.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Volumes salvos", description: `${qty} volume(s) registrado(s).` });
    onSaved();
  };

  const print = async (format: "label" | "a4" = "label") => {
    if (!route) return;
    const qty = Number(volumes);
    if (!volumes || !Number.isInteger(qty) || qty < 1 || qty > 999) {
      toast({ title: "Informe os volumes", description: "Digite a quantidade de volumes antes de imprimir.", variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      const [{ createRoot }, mod] = await Promise.all([
        import("react-dom/client"),
        format === "a4" ? import("./EtiquetaVolumesA4Print") : import("./EtiquetaVolumesPrint"),
      ]);
      const PrintView = mod.default as any;

      const { data: company } = await supabase
        .from("companies")
        .select("name, legal_name, cnpj, address, neighborhood, city, state, cep, phone")
        .eq("id", getActiveCompanyId())
        .maybeSingle();

      const { city, state } = getActiveCity();

      const data = {
        sender: (company || {}) as any,
        clientName: route.client,
        address: route.address,
        neighborhood: route.neighborhood,
        city,
        state,
        cep: route.cep,
        nfeNumber: nfeNumber.trim() || null,
        date: route.date ? route.date.split("-").reverse().join("/") : null,
        driver: route.driver?.name || null,
        plate: route.vehicle?.plate || null,
        volumes: qty,
      };

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument!;
      idoc.open();
      idoc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Etiquetas de volume — ${route.client}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: 100mm 50mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { box-sizing: border-box; }
</style></head><body><div id="print-root"></div></body></html>`);
      idoc.close();

      const root = createRoot(idoc.getElementById("print-root")!);
      root.render(<EtiquetaVolumesPrint data={data} />);

      await new Promise((r) => setTimeout(r, 500));
      try {
        await (idoc as any).fonts?.ready;
      } catch {
        /* fontes opcionais */
      }
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        root.unmount();
        iframe.remove();
      }, 1500);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Volumes da entrega</DialogTitle>
          <DialogDescription>
            {route?.client} — etiquetas de 100x50 mm, uma por volume (1/N, 2/N...).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="volumes">Quantidade de volumes</Label>
            <Input
              id="volumes"
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              value={volumes}
              disabled={!canEdit}
              onChange={(e) => setVolumes(e.target.value)}
              placeholder="Ex: 5"
            />
            <p className="text-[11px] text-muted-foreground">
              {route?.volumes
                ? "Valor salvo — pode ser corrigido manualmente."
                : "Preenchido automaticamente quando a nota informa os volumes."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nfe">Número da NF</Label>
            <Input
              id="nfe"
              value={nfeNumber}
              disabled={!canEdit}
              onChange={(e) => setNfeNumber(e.target.value)}
              placeholder="Ex: 00100264"
            />
          </div>

          <div className="flex gap-2">
            {canEdit && (
              <Button variant="secondary" className="flex-1 gap-2" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            )}
            <Button className="flex-1 gap-2" onClick={print} disabled={printing}>
              {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Imprimir etiquetas
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
