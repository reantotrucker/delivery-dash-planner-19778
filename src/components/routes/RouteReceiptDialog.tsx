import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Camera, Upload, Trash2, Loader2, Image as ImageIcon, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useAuth } from "@/hooks/useAuth";

interface Receipt {
  id: string;
  file_path: string;
  file_name: string;
  created_at: string;
  expires_at: string;
  uploaded_by: string | null;
}

interface Props {
  routeId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onChange?: () => void;
}

// Compress >2MB images via canvas
async function compressImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No canvas context"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Compression failed"));
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.82
        );
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const RouteReceiptDialog = ({ routeId, clientName, open, onOpenChange, canManage, onChange }: Props) => {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: receipts = [], refetch } = useQuery({
    queryKey: ["route-receipts", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_receipts")
        .select("*")
        .eq("route_id", routeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Receipt[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open || receipts.length === 0) return;
    (async () => {
      const paths = receipts.map((r) => r.file_path);
      const { data } = await supabase.storage.from("route-receipts").createSignedUrls(paths, 3600);
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) map[paths[i]] = d.signedUrl;
      });
      setSignedUrls(map);
    })();
  }, [receipts, open]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: `${file.name} excede 10 MB`, variant: "destructive" });
          continue;
        }
        const processed = await compressImage(file);
        const ext = processed.name.split(".").pop() || "jpg";
        const path = `${routeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("route-receipts")
          .upload(path, processed, { contentType: processed.type });
        if (upErr) throw upErr;
        const user = (await supabase.auth.getUser()).data.user;
        const { error: insErr } = await supabase.from("route_receipts").insert({
          route_id: routeId,
          file_path: path,
          file_name: file.name,
          file_size: processed.size,
          uploaded_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
      }
      toast({ title: "Canhoto anexado!" });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["route-receipt-counts"] });
      onChange?.();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao enviar foto", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const receipt = receipts.find((r) => r.id === id);
    if (!receipt) return;
    try {
      await supabase.storage.from("route-receipts").remove([receipt.file_path]);
      const { error } = await supabase.from("route_receipts").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Canhoto excluído" });
      setDeleteId(null);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["route-receipt-counts"] });
      onChange?.();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Canhotos assinados — {clientName}</DialogTitle>
            <DialogDescription>
              Fotos dos canhotos das NFe/NFCe assinados pelo cliente. Os anexos ficam guardados por tempo indeterminado.
            </DialogDescription>
          </DialogHeader>


          {canManage && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="flex-1"
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                Tirar foto
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                variant="outline"
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                Escolher arquivo
              </Button>
            </div>
          )}

          <div className="pt-2">
            {receipts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Nenhum canhoto anexado
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {receipts.map((r) => {
                  const url = signedUrls[r.file_path];
                  
                  return (
                    <div key={r.id} className="relative group border border-border rounded-md overflow-hidden bg-muted/30">
                      {url ? (
                        <button
                          className="block w-full aspect-square"
                          onClick={() => setPreviewUrl(url)}
                        >
                          <img src={url} alt={r.file_name} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="aspect-square flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <div className="p-1.5 text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                        <span>{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                        
                      </div>
                      {canManage && (isAdmin || r.uploaded_by === user?.id) && (
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="absolute top-1 right-1 bg-destructive/90 text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t mt-2">
            <Button onClick={() => onOpenChange(false)} disabled={uploading}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {previewUrl && (
        <Dialog open onOpenChange={() => setPreviewUrl(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/95">
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-2 right-2 bg-background/80 rounded-full p-1.5 z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={previewUrl} alt="Canhoto" className="w-full max-h-[85vh] object-contain" />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir canhoto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
