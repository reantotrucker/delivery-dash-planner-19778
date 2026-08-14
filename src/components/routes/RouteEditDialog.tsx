import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Route } from "./types";
import { routeSchema } from "@/lib/validations";
import { z } from "zod";
import { useCepLookup } from "@/hooks/useCepLookup";
import { Loader2 } from "lucide-react";

interface RouteEditDialogProps {
  route: Route | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const RouteEditDialog = ({ route, open, onOpenChange, onSuccess }: RouteEditDialogProps) => {
  const { lookupCep, formatCep, isLoading: isCepLoading } = useCepLookup();
  
  const [formData, setFormData] = useState({
    client: "",
    neighborhood: "",
    address: "",
    cep: "",
    consultant_id: "",
    driver_id: "",
    vehicle_id: "",
    payment_method_id: "",
    observation: "",
  });

  const handleCepChange = async (value: string) => {
    const formattedCep = formatCep(value);
    setFormData(prev => ({ ...prev, cep: formattedCep }));

    if (formattedCep.replace(/\D/g, "").length === 8) {
      const result = await lookupCep(formattedCep);
      if (result) {
        setFormData(prev => ({
          ...prev,
          address: result.address,
          neighborhood: result.neighborhood,
        }));
      }
    }
  };

  useEffect(() => {
    if (route) {
      setFormData({
        client: route.client,
        neighborhood: route.neighborhood,
        address: route.address || "",
        cep: route.cep || "",
        consultant_id: route.consultant_id || "",
        driver_id: route.driver_id || "",
        vehicle_id: route.vehicle_id || "",
        payment_method_id: route.payment_method_id || "",
        observation: route.observation || "",
      });
    }
  }, [route]);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("plate");
      if (error) throw error;
      return data;
    },
  });

  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["payment_methods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!route) return;

    try {
      routeSchema.parse(formData);
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

    try {
      const { error } = await supabase
        .from("routes")
        .update({
          ...formData,
          address: formData.address || null,
          cep: formData.cep || null,
          consultant_id: formData.consultant_id || null,
          driver_id: formData.driver_id || null,
          vehicle_id: formData.vehicle_id || null,
          payment_method_id: formData.payment_method_id || null,
        })
        .eq("id", route.id);

      if (error) throw error;

      toast({
        title: "Rota atualizada com sucesso!",
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error updating route:", error);
      }
      toast({
        title: "Erro ao atualizar rota",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">Editar Rota</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client" className="text-xs">CLIENTE *</Label>
              <Input
                id="edit-client"
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                placeholder="Nome do cliente"
                required
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-neighborhood" className="text-xs">BAIRRO *</Label>
              <Input
                id="edit-neighborhood"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                placeholder="Bairro"
                required
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address" className="text-xs">ENDEREÇO</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Rua, número..."
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-cep" className="text-xs">CEP</Label>
              <div className="relative">
                <Input
                  id="edit-cep"
                  value={formData.cep}
                  onChange={(e) => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                  className="h-9 text-sm pr-8"
                />
                {isCepLoading && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-consultant" className="text-xs">CONSULTOR</Label>
              <Select value={formData.consultant_id} onValueChange={(v) => setFormData({ ...formData, consultant_id: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {consultants.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-driver" className="text-xs">MOTORISTA</Label>
              <Select
                value={formData.driver_id}
                onValueChange={(v) => {
                  const linkedVehicle = (drivers as { id: string; default_vehicle_id?: string | null }[])
                    .find((d) => d.id === v)?.default_vehicle_id;
                  setFormData((prev) => ({ ...prev, driver_id: v, vehicle_id: linkedVehicle || prev.vehicle_id }));
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-vehicle" className="text-xs">VEÍCULO</Label>
              <Select value={formData.vehicle_id} onValueChange={(v) => setFormData({ ...formData, vehicle_id: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-payment" className="text-xs">PAGAMENTO</Label>
              <Select value={formData.payment_method_id} onValueChange={(v) => setFormData({ ...formData, payment_method_id: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-observation" className="text-xs">OBSERVAÇÃO</Label>
            <Textarea
              id="edit-observation"
              value={formData.observation}
              onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
              placeholder="Observações..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
