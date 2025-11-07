import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Route } from "./types";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { occurrenceSchema } from "@/lib/validations";
import { z } from "zod";

export interface Occurrence {
  id: string;
  route_id: string;
  motorista: boolean;
  vendedor: boolean;
  cliente: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

interface OccurrencePhoto {
  id: string;
  occurrence_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

interface RouteOccurrenceDialogProps {
  route: Route;
  occurrence?: Occurrence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const RouteOccurrenceDialog = ({
  route,
  occurrence = null,
  open,
  onOpenChange,
  onSaved,
}: RouteOccurrenceDialogProps) => {
  const [motorista, setMotorista] = useState(false);
  const [vendedor, setVendedor] = useState(false);
  const [cliente, setCliente] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<OccurrencePhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const isEditing = !!occurrence;

  // Load occurrence data when editing
  useEffect(() => {
    if (occurrence) {
      setMotorista(occurrence.motorista);
      setVendedor(occurrence.vendedor);
      setCliente(occurrence.cliente);
      setDescription(occurrence.description);
      loadPhotos(occurrence.id);
    } else {
      // Reset form when creating new
      setMotorista(false);
      setVendedor(false);
      setCliente(false);
      setDescription("");
      setPhotos([]);
      setSelectedFiles([]);
    }
  }, [occurrence, open]);

  const loadPhotos = async (occurrenceId: string) => {
    const { data, error } = await supabase
      .from("route_occurrence_photos")
      .select("*")
      .eq("occurrence_id", occurrenceId)
      .order("created_at", { ascending: false });

    if (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading photos:", error);
      }
    } else {
      setPhotos(data || []);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isUnder5MB = file.size <= 5 * 1024 * 1024;
      
      if (!isImage) {
        toast({
          title: "Arquivo inválido",
          description: `${file.name} não é uma imagem`,
          variant: "destructive",
        });
      }
      if (!isUnder5MB) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede 5MB`,
          variant: "destructive",
        });
      }
      
      return isImage && isUnder5MB;
    });
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const deletePhoto = async (photo: OccurrencePhoto) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("route-occurrences")
        .remove([photo.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("route_occurrence_photos")
        .delete()
        .eq("id", photo.id);

      if (dbError) throw dbError;

      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      
      toast({
        title: "Foto excluída com sucesso!",
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error deleting photo:", error);
      }
      toast({
        title: "Erro ao excluir foto",
        variant: "destructive",
      });
    }
  };

  const uploadPhotos = async (occurrenceId: string) => {
    if (selectedFiles.length === 0) return;

    setUploadingPhotos(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      for (const file of selectedFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${occurrenceId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("route-occurrences")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Save metadata to database
        const { error: dbError } = await supabase
          .from("route_occurrence_photos")
          .insert({
            occurrence_id: occurrenceId,
            file_path: fileName,
            file_name: file.name,
            file_size: file.size,
            created_by: user?.id,
          });

        if (dbError) throw dbError;
      }

      setSelectedFiles([]);
      if (isEditing) {
        loadPhotos(occurrenceId);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error uploading photos:", error);
      }
      toast({
        title: "Erro ao fazer upload das fotos",
        variant: "destructive",
      });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleSave = async () => {
    // Validate input using zod schema
    try {
      occurrenceSchema.parse({
        description,
        motorista,
        vendedor,
        cliente,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro de validação",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (isEditing) {
        // Update existing occurrence
        const { error } = await supabase
          .from("route_occurrences")
          .update({
            motorista,
            vendedor,
            cliente,
            description: description.trim(),
          })
          .eq("id", occurrence.id);

        if (error) throw error;

        // Upload new photos if any
        await uploadPhotos(occurrence.id);

        toast({
          title: "Ocorrência atualizada com sucesso!",
        });
      } else {
        // Insert new occurrence
        const { data: newOccurrence, error } = await supabase
          .from("route_occurrences")
          .insert({
            route_id: route.id,
            motorista,
            vendedor,
            cliente,
            description: description.trim(),
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Upload photos for new occurrence
        if (newOccurrence) {
          await uploadPhotos(newOccurrence.id);
        }

        toast({
          title: "Ocorrência registrada com sucesso!",
        });
      }

      // Reset form
      setMotorista(false);
      setVendedor(false);
      setCliente(false);
      setDescription("");
      setPhotos([]);
      setSelectedFiles([]);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving occurrence:", error);
      }
      toast({
        title: isEditing ? "Erro ao atualizar ocorrência" : "Erro ao salvar ocorrência",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Ocorrência" : "Registrar Ocorrência"}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              <strong>Cliente:</strong> {route.client}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Bairro:</strong> {route.neighborhood}
            </p>
          </div>

          <div className="space-y-4">
            <Label className="text-base font-semibold">Responsável</Label>
            <div className="flex items-center space-x-6 flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="motorista"
                  checked={motorista}
                  onCheckedChange={(checked) => setMotorista(checked === true)}
                />
                <label
                  htmlFor="motorista"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Motorista
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="vendedor"
                  checked={vendedor}
                  onCheckedChange={(checked) => setVendedor(checked === true)}
                />
                <label
                  htmlFor="vendedor"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Vendedor
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="cliente"
                  checked={cliente}
                  onCheckedChange={(checked) => setCliente(checked === true)}
                />
                <label
                  htmlFor="cliente"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Cliente
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-base font-semibold">
              Descrição da Ocorrência
            </Label>
            <Textarea
              id="description"
              placeholder="Descreva o problema ou erro de separação..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Fotos</Label>
            
            {/* Existing photos */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {photos.map((photo) => {
                  // Use authenticated storage URL - signed URLs are generated client-side
                  const photoUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/route-occurrences/${photo.file_path}`;
                  
                  return (
                    <div key={photo.id} className="relative group">
                      <img
                        src={photoUrl}
                        alt={photo.file_name}
                        className="w-full h-24 object-cover rounded border"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deletePhoto(photo)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected files preview */}
            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-24 object-cover rounded border border-primary"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeSelectedFile(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                id="photos"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <Label
                htmlFor="photos"
                className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-accent"
              >
                <Upload className="h-4 w-4" />
                Adicionar Fotos
              </Label>
              <span className="text-sm text-muted-foreground">
                {selectedFiles.length > 0 ? `${selectedFiles.length} selecionada(s)` : "Máx. 5MB por foto"}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving || uploadingPhotos}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || uploadingPhotos}>
            {saving || uploadingPhotos ? "Salvando..." : isEditing ? "Atualizar Ocorrência" : "Salvar Ocorrência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
