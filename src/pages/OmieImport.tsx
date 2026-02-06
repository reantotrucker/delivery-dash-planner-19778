import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse, isWithinInterval, startOfDay, endOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { FileText, Download, Loader2, MapPin, User, Package, CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  requestedPage?: 'last'; // when we requested the last page
}

export default function OmieImport() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'nfe' | 'nfce'>('nfe');
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string | number>>(new Set());
  const [period, setPeriod] = useState<'MANHA' | 'TARDE'>('MANHA');
  const [currentPage, setCurrentPage] = useState<number | null>(null); // null = fetch last page
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const { data, isLoading, error, refetch } = useQuery<OmieResponse>({
    queryKey: ['omie-invoices', activeTab, currentPage],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('omie-invoices', {
        body: {
          type: activeTab,
          page: currentPage ?? 1,
          fetchLastPage: currentPage === null,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    enabled: false,
  });

  // Filter invoices by date range client-side
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    if (!startDate && !endDate) return data.invoices;

    return data.invoices.filter((invoice) => {
      if (!invoice.emissionDate) return false;
      
      // Parse date from DD/MM/YYYY format
      try {
        const invoiceDate = parse(invoice.emissionDate, 'dd/MM/yyyy', new Date());
        
        if (startDate && endDate) {
          return isWithinInterval(invoiceDate, {
            start: startOfDay(startDate),
            end: endOfDay(endDate),
          });
        } else if (startDate) {
          return invoiceDate >= startOfDay(startDate);
        } else if (endDate) {
          return invoiceDate <= endOfDay(endDate);
        }
        return true;
      } catch {
        return true; // Include if date parsing fails
      }
    });
  }, [data?.invoices, startDate, endDate]);

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
    setCurrentPage(null); // null triggers fetchLastPage
    setSelectedInvoices(new Set());
    refetch();
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setSelectedInvoices(new Set());
    refetch();
  };

  const handleSelectAll = () => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map(inv => inv.id)));
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
    const selectedList = filteredInvoices.filter(inv => selectedInvoices.has(inv.id));
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Documento</Label>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'nfe' | 'nfce')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="nfe">NF-e</TabsTrigger>
                  <TabsTrigger value="nfce">NFC-e</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">
                  Notas Fiscais Encontradas
                </CardTitle>
                <CardDescription>
                  {filteredInvoices.length} de {data.invoices.length} nesta página ({data.totalRecords} total) • Página {data.page} de {data.totalPages}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-4">
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
                  {selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0 
                    ? 'Desmarcar Todos' 
                    : 'Selecionar Todos'}
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
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma nota fiscal encontrada no período selecionado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((invoice) => (
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

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(data.page - 1)}
                  disabled={data.page <= 1 || isLoading}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Mais antigas
                </Button>
                <span className="text-sm text-muted-foreground px-4">
                  Página {data.page} de {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(data.page + 1)}
                  disabled={data.page >= data.totalPages || isLoading}
                >
                  Mais recentes
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
