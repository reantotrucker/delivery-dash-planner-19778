import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { Tag, Printer, Save, FilePlus2, Trash2, Search, Loader2, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  EtiquetaManual,
  ManualLabelData,
  ManualLabelSender,
  emptyManualLabel,
  labelSequence,
} from "@/components/labels/EtiquetaManual";

interface Template {
  id: string;
  name: string;
  data: ManualLabelData;
  created_by_name: string | null;
  updated_at: string;
}

async function printLabels(d: ManualLabelData, sender: ManualLabelSender | null) {
  const [{ createRoot }, mod] = await Promise.all([
    import("react-dom/client"),
    import("@/components/labels/EtiquetaManual"),
  ]);
  const PrintView = mod.EtiquetaManualPrint;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument!;
  idoc.open();
  idoc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Etiquetas</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: 100mm 50mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  * { box-sizing: border-box; }
</style></head><body><div id="print-root"></div></body></html>`);
  idoc.close();
  const root = createRoot(idoc.getElementById("print-root")!);
  root.render(<PrintView d={d} sender={sender} />);
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
}

export default function ManualLabels() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [form, setForm] = useState<ManualLabelData>(emptyManualLabel());
  const [sender, setSender] = useState<ManualLabelSender | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Template | null>(null);

  const set = <K extends keyof ManualLabelData>(k: K, v: ManualLabelData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const loadTemplates = useCallback(async () => {
    if (!companyId) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from("manual_label_templates")
      .select("id, name, data, created_by_name, updated_at")
      .eq("company_id", companyId)
      .order("name", { ascending: true });
    if (error) toast.error("Erro ao carregar etiquetas salvas");
    setTemplates(((data as any[]) || []).map((t) => ({ ...t, data: { ...emptyManualLabel(), ...(t.data || {}) } })));
    setLoadingList(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("companies")
      .select("name, legal_name, cnpj, address, neighborhood, city, state, cep, phone")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => setSender((data as ManualLabelSender) || null));
    loadTemplates();
    setCurrentId(null);
    setTemplateName("");
    setForm(emptyManualLabel());
  }, [companyId, loadTemplates]);

  const seq = useMemo(() => labelSequence(form), [form]);

  const setTotal = (raw: string) => {
    const n = Math.max(1, Math.min(999, parseInt(raw, 10) || 1));
    setForm((f) => ({ ...f, total: n, inicio: 1, fim: n }));
  };

  const handlePrint = () => {
    if (!form.destinatario.trim()) {
      toast.error("Informe o destinatário");
      return;
    }
    printLabels(form, sender);
  };

  const handleSave = async (asNew: boolean) => {
    const name = templateName.trim() || form.destinatario.trim();
    if (!name) {
      toast.error("Dê um nome para salvar a etiqueta");
      return;
    }
    setSaving(true);
    let createdByName: string | null = null;
    if (user) {
      const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
      createdByName = p?.full_name || p?.email || null;
    }
    const payload = { name, data: form as any };
    const res =
      currentId && !asNew
        ? await supabase.from("manual_label_templates").update(payload).eq("id", currentId).select("id").single()
        : await supabase
            .from("manual_label_templates")
            .insert({ ...payload, company_id: companyId, created_by: user?.id ?? null, created_by_name: createdByName })
            .select("id")
            .single();
    setSaving(false);
    if (res.error) {
      toast.error("Não foi possível salvar a etiqueta");
      return;
    }
    setCurrentId(res.data.id);
    setTemplateName(name);
    toast.success(currentId && !asNew ? "Etiqueta atualizada" : "Etiqueta salva");
    loadTemplates();
  };

  const loadTemplate = (t: Template) => {
    setForm({ ...emptyManualLabel(), ...t.data, inicio: 1, fim: Math.max(1, t.data.total || 1) });
    setCurrentId(t.id);
    setTemplateName(t.name);
  };

  const newLabel = () => {
    setForm(emptyManualLabel());
    setCurrentId(null);
    setTemplateName("");
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("manual_label_templates").delete().eq("id", toDelete.id);
    if (error) toast.error("Não foi possível excluir");
    else {
      toast.success("Etiqueta excluída");
      if (currentId === toDelete.id) newLabel();
      loadTemplates();
    }
    setToDelete(null);
  };

  const filtered = templates.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.data.destinatario || "").toLowerCase().includes(q);
  });

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl pb-24 lg:pb-6">
      <div className="mb-5">
        <h1 className="text-2xl md:text-3xl font-black text-foreground flex items-center gap-2">
          <Tag className="w-7 h-7 text-primary" />
          Etiqueta manual
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Etiqueta 100×50 mm. Escolha a quantidade, imprima e salve para usar nas próximas vezes.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-foreground">
                {currentId ? `Editando: ${templateName}` : "Nova etiqueta"}
              </h2>
              <Button variant="outline" size="sm" onClick={newLabel}>
                <FilePlus2 className="w-4 h-4 mr-1" /> Nova
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="show-sender" className="font-semibold">Mostrar remetente</Label>
                <p className="text-xs text-muted-foreground">
                  {sender?.legal_name || sender?.name || "Dados da loja em Configurações"}
                </p>
              </div>
              <Switch id="show-sender" checked={form.showSender} onCheckedChange={(v) => set("showSender", v)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Destinatário *</Label>
                <Input value={form.destinatario} onChange={(e) => set("destinatario", e.target.value)} placeholder="Nome do cliente" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
              </div>
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>UF</Label>
                  <Input value={form.uf} maxLength={2} onChange={(e) => set("uf", e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => set("cep", e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} inputMode="tel" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Referência (NF, pedido…)</Label>
                <Input value={form.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Ex.: NF 101564 · Pedido 758" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Observação</Label>
                <Textarea rows={2} value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Ex.: Barco Leão do Norte · Frágil" />
              </div>
            </div>
          </Card>

          <Card className="p-4 md:p-5 space-y-4">
            <h2 className="font-bold text-foreground">Quantidade</h2>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="numerar" className="font-semibold">Numerar volumes (1/N, 2/N…)</Label>
                <p className="text-xs text-muted-foreground">Desligado: imprime cópias iguais, sem número.</p>
              </div>
              <Switch id="numerar" checked={form.numerar} onCheckedChange={(v) => set("numerar", v)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{form.numerar ? "Total de volumes" : "Cópias"}</Label>
                <Input type="number" min={1} max={999} value={form.total} onChange={(e) => setTotal(e.target.value)} />
              </div>
              {form.numerar && (
                <>
                  <div className="space-y-1.5">
                    <Label>Imprimir de</Label>
                    <Input
                      type="number"
                      min={1}
                      max={form.total}
                      value={form.inicio}
                      onChange={(e) => set("inicio", parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>até</Label>
                    <Input
                      type="number"
                      min={1}
                      max={form.total}
                      value={form.fim}
                      onChange={(e) => set("fim", parseInt(e.target.value, 10) || 1)}
                    />
                  </div>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Vai imprimir <strong className="text-foreground">{seq.length}</strong>{" "}
              {seq.length === 1 ? "etiqueta" : "etiquetas"}
              {form.numerar && seq.length > 0 && (
                <> — {seq[0]}/{form.total} até {seq[seq.length - 1]}/{form.total}</>
              )}
            </p>
          </Card>

          <Card className="p-4 md:p-5 space-y-3">
            <h2 className="font-bold text-foreground">Prévia</h2>
            <div className="overflow-x-auto rounded-md bg-muted p-3">
              <div className="mx-auto w-fit shadow-md ring-1 ring-border">
                <EtiquetaManual d={form} sender={sender} index={seq[0] ?? 1} print={false} />
              </div>
            </div>
          </Card>

          <Card className="p-4 md:p-5 space-y-3">
            <div className="space-y-1.5">
              <Label>Nome para salvar</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={form.destinatario || "Ex.: Cliente X – Barco"}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePrint} className="flex-1 min-w-[160px]">
                <Printer className="w-4 h-4 mr-1" /> Imprimir {seq.length}
              </Button>
              <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving} className="flex-1 min-w-[160px]">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                {currentId ? "Atualizar salva" : "Salvar etiqueta"}
              </Button>
              {currentId && (
                <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
                  Salvar como nova
                </Button>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-4 h-fit lg:sticky lg:top-4 space-y-3">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary" /> Etiquetas salvas
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="pl-8" />
          </div>
          {loadingList ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {templates.length === 0 ? "Nenhuma etiqueta salva ainda." : "Nada encontrado."}
            </p>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-2.5 transition-colors",
                    currentId === t.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                  )}
                >
                  <button type="button" onClick={() => loadTemplate(t)} className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm text-foreground truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[t.data.destinatario, [t.data.cidade, t.data.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.data.numerar ? `${t.data.total} vol.` : `${t.data.total} cópia(s)`}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive shrink-0"
                    onClick={() => setToDelete(t)}
                    aria-label={`Excluir ${t.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etiqueta salva?</AlertDialogTitle>
            <AlertDialogDescription>"{toDelete?.name}" será removida da lista.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
