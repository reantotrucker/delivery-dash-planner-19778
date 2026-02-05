import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Download, Loader2, MapPin, User, CreditCard, Package } from "lucide-react";

interface OmieInvoice {
  id: string | number;
  number: string | number;
  series: string;
  emissionDate: string;
  clientId: number;
  clientName: string;
  clientCpfCnpj: string;
  address: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    cep: string;
  } | null;
  totalValue: number;
  status?: string;
  paymentMethod?: string;
  accessKey?: string;
  orderId?: number;
}

interface OmieResponse {
  type: 'nfe' | 'nfce';
  page: number;
  totalPages: number;
  totalRecords: number;
  invoices: OmieInvoice[];
}

export default function OmieImport() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'nfe' | 'nfce'>('nfe');
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string | number>>(new Set());
  const [period, setPeriod] = useState<'MANHA' | 'TARDE'>('MANHA');
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery<OmieResponse>({
    queryKey: ['omie-invoices', activeTab, currentPage],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('omie-invoices', {
        body: {
          type: activeTab,
          page: currentPage,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    enabled: false,
  });

  const createRoutesMutation = useMutation({
    mutationFn: async (invoices: OmieInvoice[]) => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const routesToCreate = invoices.map((invoice, index) => ({
        client: invoice.clientName || `Cliente ${invoice.clientId}`,
        neighborhood: invoice.address?.neighborhood || 'N/A',
        address: invoice.address 
          ? `${invoice.address.street}, ${invoice.address.number}${invoice.address.complement ? ` - ${invoice.address.complement}` : ''}`
          : null,
        cep: invoice.address?.cep || null,
        observation: `NF ${invoice.number} - Valor: R$ ${invoice.totalValue?.toFixed(2) || '0,00'}`,
        date: today,
        period: period,
        order_number: index + 1,
        status: 'NAO_ENTREGUE' as const,
      }));

      const { data, error } = await supabase
        .from('routes')
        .insert(routesToCreate)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.length} rotas criadas com sucesso!`);
      setSelectedInvoices(new Set());
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (error) => {
      toast.error(`Erro ao criar rotas: ${error.message}`);
    },
  });

  const handleSearch = () => {
    refetch();
  };

  const handleSelectAll = () => {
    if (!data?.invoices) return;
    
    if (selectedInvoices.size === data.invoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(data.invoices.map(inv => inv.id)));
    }
  };

  const handleSelectInvoice = (id: string | number) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInvoices(newSelected);
  };

  const handleCreateRoutes = () => {
    if (!data?.invoices) return;
    
    const selectedList = data.invoices.filter(inv => selectedInvoices.has(inv.id));
    if (selectedList.length === 0) {
      toast.error('Selecione pelo menos uma nota fiscal');
      return;
    }
    
    createRoutesMutation.mutate(selectedList);
  };

  const formatAddress = (address: OmieInvoice['address']) => {
    if (!address) return 'Endereço não disponível';
    return `${address.street}, ${address.number} - ${address.neighborhood}, ${address.city}/${address.state}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar do Omie</h1>
        <p className="text-muted-foreground">
          Busque notas fiscais do Omie e crie rotas de entrega automaticamente
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros de Busca</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Documento</Label>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'nfe' | 'nfce')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="nfe">NF-e</TabsTrigger>
                  <TabsTrigger value="nfce">NFC-e</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Buscar Notas
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Resultados */}
      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  Notas Fiscais Encontradas
                </CardTitle>
                <CardDescription>
                  {data.totalRecords} registros • Página {data.page} de {data.totalPages}
                </CardDescription>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label>Período:</Label>
                  <Select value={period} onValueChange={(v) => setPeriod(v as 'MANHA' | 'TARDE')}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANHA">Manhã</SelectItem>
                      <SelectItem value="TARDE">Tarde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedInvoices.size === data.invoices.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </Button>

                <Button
                  onClick={handleCreateRoutes}
                  disabled={selectedInvoices.size === 0 || createRoutesMutation.isPending}
                >
                  {createRoutesMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Package className="w-4 h-4 mr-2" />
                      Criar {selectedInvoices.size} Rotas
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma nota fiscal encontrada no período selecionado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                      selectedInvoices.has(invoice.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => handleSelectInvoice(invoice.id)}
                  >
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={selectedInvoices.has(invoice.id)}
                        onCheckedChange={() => handleSelectInvoice(invoice.id)}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Info da NF */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {activeTab === 'nfe' ? 'NF-e' : 'NFC-e'} #{invoice.number}
                            </span>
                            {invoice.series && (
                              <Badge variant="outline" className="text-xs">
                                Série {invoice.series}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Emitida em {invoice.emissionDate}
                          </p>
                          <p className="text-lg font-semibold text-primary">
                            R$ {invoice.totalValue?.toFixed(2) || '0,00'}
                          </p>
                        </div>

                        {/* Cliente */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium truncate">
                              {invoice.clientName || `Cliente ${invoice.clientId}`}
                            </span>
                          </div>
                          {invoice.clientCpfCnpj && (
                            <p className="text-sm text-muted-foreground">
                              {invoice.clientCpfCnpj}
                            </p>
                          )}
                        </div>

                        {/* Endereço */}
                        <div className="space-y-1">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <span className="text-sm">
                              {formatAddress(invoice.address)}
                            </span>
                          </div>
                          {invoice.address?.cep && (
                            <p className="text-sm text-muted-foreground pl-6">
                              CEP: {invoice.address.cep}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
