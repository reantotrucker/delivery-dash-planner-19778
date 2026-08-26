import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActiveCompanyId } from "@/lib/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "", color: "", default_vehicle_id: "" });

  const { data: drivers = [], refetch } = useQuery({
    queryKey: ["drivers", getActiveCompanyId()],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("company_id", getActiveCompanyId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", getActiveCompanyId()],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("company_id", getActiveCompanyId()).order("plate");
      if (error) throw error;
      return data;
    },
  });


  const addDriver = async () => {
    try {
      driverSchema.parse(newDriver);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("drivers").insert({ ...newDriver, company_id: getActiveCompanyId() });
    if (error) {
      toast.error("Erro ao adicionar motorista");
      return;
    }

    toast.success("Motorista adicionado");
    setNewDriver({ name: "", color: "#FF6B00" });
    refetch();
  };

  const startEdit = (driver: { id: string; name: string; color: string; default_vehicle_id?: string | null }) => {
    setEditingId(driver.id);
    setEditData({ name: driver.name, color: driver.color, default_vehicle_id: driver.default_vehicle_id || "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({ name: "", color: "", default_vehicle_id: "" });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    try {
      driverSchema.parse({ name: editData.name, color: editData.color });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase
      .from("drivers")
      .update({
        name: editData.name,
        color: editData.color,
        default_vehicle_id: editData.default_vehicle_id || null,
      })
      .eq("id", editingId);

    if (error) {
      toast.error("Erro ao atualizar motorista");
      return;
    }

    toast.success("Motorista atualizado");
    setEditingId(null);
    setEditData({ name: "", color: "", default_vehicle_id: "" });
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
              {editingId === driver.id ? (
                <div className="flex items-center gap-3 flex-1 mr-4">
                  <Input
                    type="color"
                    value={editData.color}
                    onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                    className="w-12 h-8 p-1"
                  />
                  <Input
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="flex-1"
                  />
                  <Select
                    value={editData.default_vehicle_id || "none"}
                    onValueChange={(v) => setEditData({ ...editData, default_vehicle_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem veículo</SelectItem>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: driver.color }}
                  />
                  <span className="font-medium">{driver.name}</span>
                  {driver.default_vehicle_id && (
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                      {vehicles.find((v) => v.id === driver.default_vehicle_id)?.plate}
                    </span>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                {editingId === driver.id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={saveEdit}>
                      <Check className="w-4 h-4 text-green-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(driver)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteDriver(driver.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const VehiclesSettings = () => {
  const [newVehicle, setNewVehicle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState("");

  const { data: vehicles = [], refetch } = useQuery({
    queryKey: ["vehicles", getActiveCompanyId()],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("company_id", getActiveCompanyId()).order("plate");
      if (error) throw error;
      return data;
    },
  });

  const addVehicle = async () => {
    try {
      vehicleSchema.parse({ plate: newVehicle });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("vehicles").insert({ plate: newVehicle, company_id: getActiveCompanyId() });
    if (error) {
      toast.error("Erro ao adicionar veículo");
      return;
    }

    toast.success("Veículo adicionado");
    setNewVehicle("");
    refetch();
  };

  const startEdit = (vehicle: { id: string; plate: string }) => {
    setEditingId(vehicle.id);
    setEditData(vehicle.plate);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData("");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    try {
      vehicleSchema.parse({ plate: editData });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase
      .from("vehicles")
      .update({ plate: editData })
      .eq("id", editingId);

    if (error) {
      toast.error("Erro ao atualizar veículo");
      return;
    }

    toast.success("Veículo atualizado");
    setEditingId(null);
    setEditData("");
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
              {editingId === vehicle.id ? (
                <Input
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="flex-1 mr-4"
                />
              ) : (
                <span className="font-medium">{vehicle.plate}</span>
              )}
              <div className="flex gap-2">
                {editingId === vehicle.id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={saveEdit}>
                      <Check className="w-4 h-4 text-green-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(vehicle)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteVehicle(vehicle.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const ConsultantsSettings = () => {
  const [newConsultant, setNewConsultant] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState("");

  const { data: consultants = [], refetch } = useQuery({
    queryKey: ["consultants", getActiveCompanyId()],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("*").eq("company_id", getActiveCompanyId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const addConsultant = async () => {
    try {
      consultantSchema.parse({ name: newConsultant });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("consultants").insert({ name: newConsultant, company_id: getActiveCompanyId() });
    if (error) {
      toast.error("Erro ao adicionar consultor");
      return;
    }

    toast.success("Consultor adicionado");
    setNewConsultant("");
    refetch();
  };

  const startEdit = (consultant: { id: string; name: string }) => {
    setEditingId(consultant.id);
    setEditData(consultant.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData("");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    try {
      consultantSchema.parse({ name: editData });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase
      .from("consultants")
      .update({ name: editData })
      .eq("id", editingId);

    if (error) {
      toast.error("Erro ao atualizar consultor");
      return;
    }

    toast.success("Consultor atualizado");
    setEditingId(null);
    setEditData("");
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
              {editingId === consultant.id ? (
                <Input
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="flex-1 mr-4"
                />
              ) : (
                <span className="font-medium">{consultant.name}</span>
              )}
              <div className="flex gap-2">
                {editingId === consultant.id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={saveEdit}>
                      <Check className="w-4 h-4 text-green-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(consultant)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteConsultant(consultant.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const PaymentMethodsSettings = () => {
  const [newPayment, setNewPayment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState("");

  const { data: payments = [], refetch } = useQuery({
    queryKey: ["payment_methods", getActiveCompanyId()],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").eq("company_id", getActiveCompanyId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const addPayment = async () => {
    try {
      paymentMethodSchema.parse({ name: newPayment });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase.from("payment_methods").insert({ name: newPayment, company_id: getActiveCompanyId() });
    if (error) {
      toast.error("Erro ao adicionar forma de pagamento");
      return;
    }

    toast.success("Forma de pagamento adicionada");
    setNewPayment("");
    refetch();
  };

  const startEdit = (payment: { id: string; name: string }) => {
    setEditingId(payment.id);
    setEditData(payment.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData("");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    try {
      paymentMethodSchema.parse({ name: editData });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    const { error } = await supabase
      .from("payment_methods")
      .update({ name: editData })
      .eq("id", editingId);

    if (error) {
      toast.error("Erro ao atualizar forma de pagamento");
      return;
    }

    toast.success("Forma de pagamento atualizada");
    setEditingId(null);
    setEditData("");
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
              {editingId === payment.id ? (
                <Input
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="flex-1 mr-4"
                />
              ) : (
                <span className="font-medium">{payment.name}</span>
              )}
              <div className="flex gap-2">
                {editingId === payment.id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={saveEdit}>
                      <Check className="w-4 h-4 text-green-500" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(payment)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deletePayment(payment.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default Settings;
