import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import {
  driverSchema, 
  vehicleSchema, 
  consultantSchema, 
  paymentMethodSchema 
} from "@/lib/validations";
import { z } from "zod";

const Settings = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">Configurações</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs defaultValue="drivers">
          <TabsList className="mb-6">
            <TabsTrigger value="drivers">Motoristas</TabsTrigger>
            <TabsTrigger value="vehicles">Veículos</TabsTrigger>
            <TabsTrigger value="consultants">Consultores</TabsTrigger>
            <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="drivers">
            <DriversSettings />
          </TabsContent>

          <TabsContent value="vehicles">
            <VehiclesSettings />
          </TabsContent>

          <TabsContent value="consultants">
            <ConsultantsSettings />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentMethodsSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const DriversSettings = () => {
  const [newDriver, setNewDriver] = useState({ name: "", color: "#FF6B00" });

  const { data: drivers = [], refetch } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addDriver = async () => {
    // Validate input using zod schema
    try {
      driverSchema.parse(newDriver);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("drivers").insert(newDriver);
    if (error) {
      toast.error("Erro ao adicionar motorista");
      return;
    }

    toast.success("Motorista adicionado");
    setNewDriver({ name: "", color: "#FF6B00" });
    refetch();
  };

  const deleteDriver = async (id: string) => {
    const { error } = await supabase.from("drivers").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir motorista");
      return;
    }
    toast.success("Motorista excluído");
    refetch();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Adicionar Motorista</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={newDriver.name}
              onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
              placeholder="Nome do motorista"
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <Input
              type="color"
              value={newDriver.color}
              onChange={(e) => setNewDriver({ ...newDriver, color: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addDriver} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Motoristas Cadastrados</h2>
        <div className="space-y-2">
          {drivers.map((driver) => (
            <div key={driver.id} className="flex items-center justify-between p-3 border border-border rounded">
              <div className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: driver.color }}
                />
                <span className="font-medium">{driver.name}</span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteDriver(driver.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const VehiclesSettings = () => {
  const [newVehicle, setNewVehicle] = useState("");

  const { data: vehicles = [], refetch } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("plate");
      if (error) throw error;
      return data;
    },
  });

  const addVehicle = async () => {
    // Validate input using zod schema
    try {
      vehicleSchema.parse({ plate: newVehicle });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("vehicles").insert({ plate: newVehicle });
    if (error) {
      toast.error("Erro ao adicionar veículo");
      return;
    }

    toast.success("Veículo adicionado");
    setNewVehicle("");
    refetch();
  };

  const deleteVehicle = async (id: string) => {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir veículo");
      return;
    }
    toast.success("Veículo excluído");
    refetch();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Adicionar Veículo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Placa</Label>
            <Input
              value={newVehicle}
              onChange={(e) => setNewVehicle(e.target.value)}
              placeholder="QZF-3A06"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addVehicle} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Veículos Cadastrados</h2>
        <div className="space-y-2">
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="flex items-center justify-between p-3 border border-border rounded">
              <span className="font-medium">{vehicle.plate}</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteVehicle(vehicle.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const ConsultantsSettings = () => {
  const [newConsultant, setNewConsultant] = useState("");

  const { data: consultants = [], refetch } = useQuery({
    queryKey: ["consultants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addConsultant = async () => {
    // Validate input using zod schema
    try {
      consultantSchema.parse({ name: newConsultant });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("consultants").insert({ name: newConsultant });
    if (error) {
      toast.error("Erro ao adicionar consultor");
      return;
    }

    toast.success("Consultor adicionado");
    setNewConsultant("");
    refetch();
  };

  const deleteConsultant = async (id: string) => {
    const { error } = await supabase.from("consultants").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir consultor");
      return;
    }
    toast.success("Consultor excluído");
    refetch();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Adicionar Consultor</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={newConsultant}
              onChange={(e) => setNewConsultant(e.target.value)}
              placeholder="Nome do consultor"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addConsultant} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Consultores Cadastrados</h2>
        <div className="space-y-2">
          {consultants.map((consultant) => (
            <div key={consultant.id} className="flex items-center justify-between p-3 border border-border rounded">
              <span className="font-medium">{consultant.name}</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteConsultant(consultant.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const PaymentMethodsSettings = () => {
  const [newPayment, setNewPayment] = useState("");

  const { data: payments = [], refetch } = useQuery({
    queryKey: ["payment_methods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addPayment = async () => {
    // Validate input using zod schema
    try {
      paymentMethodSchema.parse({ name: newPayment });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("payment_methods").insert({ name: newPayment });
    if (error) {
      toast.error("Erro ao adicionar forma de pagamento");
      return;
    }

    toast.success("Forma de pagamento adicionada");
    setNewPayment("");
    refetch();
  };

  const deletePayment = async (id: string) => {
    const { error } = await supabase.from("payment_methods").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir forma de pagamento");
      return;
    }
    toast.success("Forma de pagamento excluída");
    refetch();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Adicionar Forma de Pagamento</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={newPayment}
              onChange={(e) => setNewPayment(e.target.value)}
              placeholder="Ex: PIX"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={addPayment} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h2 className="text-xl font-bold text-primary mb-4">Formas de Pagamento Cadastradas</h2>
        <div className="space-y-2">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between p-3 border border-border rounded">
              <span className="font-medium">{payment.name}</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deletePayment(payment.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Settings;
