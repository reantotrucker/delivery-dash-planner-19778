import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Route } from "./types";
import { routeSchema } from "@/lib/validations";
import { z } from "zod";

interface RouteFormProps {
  period: "MANHA" | "TARDE";
  date: Date;
  onSuccess: () => void;
  editingRoute?: Route | null;
  onCancelEdit?: () => void;
}

export const RouteForm = ({ period, date, onSuccess, editingRoute, onCancelEdit }: RouteFormProps) => {
  const [formData, setFormData] = useState({
    client: "",
    neighborhood: "",
    consultant_id: "",
    driver_id: "",
    vehicle_id: "",
    payment_method_id: "",
    observation: "",
  });

  useEffect(() => {
    if (editingRoute) {
      setFormData({
        client: editingRoute.client,
        neighborhood: editingRoute.neighborhood,
        consultant_id: editingRoute.consultant_id || "",
        driver_id: editingRoute.driver_id || "",
        vehicle_id: editingRoute.vehicle_id || "",
        payment_method_id: editingRoute.payment_method_id || "",
        observation: editingRoute.observation || "",
      });
    }
  }, [editingRoute]);

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

    // Validate input using zod schema
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
      if (editingRoute) {
        const { error } = await supabase
          .from("routes")
          .update({
            ...formData,
            consultant_id: formData.consultant_id || null,
            driver_id: formData.driver_id || null,
            vehicle_id: formData.vehicle_id || null,
            payment_method_id: formData.payment_method_id || null,
          })
          .eq("id", editingRoute.id);

        if (error) throw error;

        toast({
          title: "Rota atualizada com sucesso!",
        });
        
        if (onCancelEdit) onCancelEdit();
      } else {
        const { error } = await supabase.from("routes").insert({
          ...formData,
          date: format(date, "yyyy-MM-dd"),
          period,
          consultant_id: formData.consultant_id || null,
          driver_id: formData.driver_id || null,
          vehicle_id: formData.vehicle_id || null,
          payment_method_id: formData.payment_method_id || null,
        });

        if (error) throw error;

        toast({
          title: "Rota criada com sucesso!",
        });
      }

      setFormData({
        client: "",
        neighborhood: "",
        consultant_id: "",
        driver_id: "",
        vehicle_id: "",
        payment_method_id: "",
        observation: "",
      });

      onSuccess();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving route:", error);
      }
      toast({
        title: "Erro ao salvar rota",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">
          {editingRoute ? "Editar Rota" : "Criar Nova Rota"}
        </h2>
        {editingRoute && onCancelEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
            Cancelar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label htmlFor="client" className="text-xs">CLIENTE *</Label>
          <Input
            id="client"
            value={formData.client}
            onChange={(e) => setFormData({ ...formData, client: e.target.value })}
            placeholder="Nome do cliente"
            required
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="neighborhood" className="text-xs">BAIRRO *</Label>
          <Input
            id="neighborhood"
            value={formData.neighborhood}
            onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
            placeholder="Bairro"
            required
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="consultant" className="text-xs">CONSULTOR</Label>
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

        <div className="space-y-1">
          <Label htmlFor="driver" className="text-xs">MOTORISTA</Label>
          <Select value={formData.driver_id} onValueChange={(v) => setFormData({ ...formData, driver_id: v })}>
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

        <div className="space-y-1">
          <Label htmlFor="vehicle" className="text-xs">VEÍCULO</Label>
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

        <div className="space-y-1">
          <Label htmlFor="payment" className="text-xs">PAGAMENTO</Label>
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

        <div className="space-y-1 col-span-2">
          <Label htmlFor="observation" className="text-xs">OBSERVAÇÃO</Label>
          <Textarea
            id="observation"
            value={formData.observation}
            onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
            placeholder="Observações..."
            rows={1}
            className="text-sm resize-none"
          />
        </div>
      </div>

      <Button type="submit" className="w-full h-9 text-sm">
        {editingRoute ? "Atualizar Rota" : "Criar Rota"}
      </Button>
    </form>
  );
};
