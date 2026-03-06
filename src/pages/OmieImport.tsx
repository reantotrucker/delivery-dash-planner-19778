import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse, isWithinInterval, startOfDay, endOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { FileText, Download, Loader2, MapPin, User, Package, CalendarIcon, ChevronLeft, ChevronRight, CreditCard, ShoppingCart, AlertTriangle, Search, Upload, Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// Omie tPag fiscal codes mapped to local payment method names
const OMIE_PAYMENT_MAP: Record<string, string> = {
  '01': 'DINHEIRO',
  '02': 'COLETA', // Cheque -> closest match
  '03': 'CARTAO CREDITO',
  '04': 'CARTAO CREDITO', // Débito -> same category
  '05': 'COLETA', // Crédito Loja
  '14': 'BOLETO', // Duplicata -> Boleto
  '15': 'BOLETO',
  '17': 'PIX',
  '99': 'DINHEIRO',
};

interface OmieProduct {
  name: string;
  quantity: number;
  unit: string;
  unitValue: number;
  totalValue: number;
  code: string;
}

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
  orderObservation?: string;
  vendedorName?: string | null;
  products?: OmieProduct[];
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
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [dialogPeriod, setDialogPeriod] = useState<'MANHA' | 'TARDE'>('MANHA');
  const [dialogInvoice, setDialogInvoice] = useState<OmieInvoice | null>(null);
  const [dialogDriverId, setDialogDriverId] = useState<string>('');
  const [dialogVehicleId, setDialogVehicleId] = useState<string>('');
  const [dialogConsultantId, setDialogConsultantId] = useState<string>('');
  const [dialogPaymentMethodId, setDialogPaymentMethodId] = useState<string>('');
  const [productsInvoice, setProductsInvoice] = useState<OmieInvoice | null>(null);
  const [dialogUrgent, setDialogUrgent] = useState(false);
  const [createdInvoices, setCreatedInvoices] = useState<Set<string | number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [extractFormData, setExtractFormData] = useState({
    client: '',
    neighborhood: '',
    address: '',
    cep: '',
    observation: '',
    driverId: '',
    vehicleId: '',
    consultantId: '',
    paymentMethodId: '',
    period: 'MANHA' as 'MANHA' | 'TARDE',
    urgent: false,
  });
  const [extractedProducts, setExtractedProducts] = useState<Array<{
    name: string; code: string | null; quantity: number; unit: string; unit_value: number | null; total_value: number | null;
  }>>([]);
  // Query existing routes to find already-imported NF numbers
  const { data: existingRoutes } = useQuery({
    queryKey: ['existing-route-nf-numbers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('routes')
        .select('observation')
        .like('observation', 'NF %');
      return data || [];
    },
  });

  // Query master data for selectors
  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, name').order('name');
      return data || [];
    },
  });
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, plate').order('plate');
      return data || [];
    },
  });
  const { data: consultants } = useQuery({
    queryKey: ['consultants'],
    queryFn: async () => {
      const { data } = await supabase.from('consultants').select('id, name').order('name');
      return data || [];
    },
  });
  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const { data } = await supabase.from('payment_methods').select('id, name').order('name');
      return data || [];
    },
  });

  // Extract NF numbers from existing routes
  const importedNfNumbers = useMemo(() => {
    const set = new Set<string>();
    existingRoutes?.forEach((r) => {
      const match = r.observation?.match(/^NF\s+(\S+)/);
      if (match) set.add(match[1]);
    });
    createdInvoices.forEach(id => set.add(String(id)));
    return set;
  }, [existingRoutes, createdInvoices]);

  // Resolve payment method ID from Omie tPag code
  const resolvePaymentMethodId = useCallback((tPag?: string): string | null => {
    if (!tPag || !paymentMethods) return null;
    const mappedName = OMIE_PAYMENT_MAP[tPag];
    if (!mappedName) return null;
    const found = paymentMethods.find(pm => pm.name === mappedName);
    return found?.id || null;
  }, [paymentMethods]);

  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [fetchCounter, setFetchCounter] = useState(0);

  const { data, isLoading, error } = useQuery<OmieResponse>({
    queryKey: ['omie-invoices', activeTab, currentPage, fetchCounter],
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
    enabled: fetchCounter > 0,
    staleTime: 10 * 60 * 1000, // 10 minutos - mantém cache ao navegar
    gcTime: 30 * 60 * 1000, // 30 minutos - mantém no garbage collector
  });

  // Filter invoices by date range and search term client-side
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    
    let result = data.invoices;

    // Date filter
    if (startDate || endDate) {
      result = result.filter((invoice) => {
        if (!invoice.emissionDate) return false;
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
          return true;
        }
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((invoice) => {
        const clientMatch = invoice.clientName?.toLowerCase().includes(term);
        const numberMatch = String(invoice.number).toLowerCase().includes(term);
        return clientMatch || numberMatch;
      });
    }

    return result;
  }, [data?.invoices, startDate, endDate, searchTerm]);

  const createRoutesMutation = useMutation({
    mutationFn: async ({ invoice, driverId, vehicleId, consultantId, paymentMethodId, urgent, period }: { 
      invoice: OmieInvoice; driverId: string; vehicleId: string; consultantId: string; paymentMethodId: string; urgent: boolean; period: 'MANHA' | 'TARDE';
    }) => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const routeToCreate = {
        client: invoice.clientName || `Cliente ${invoice.clientId}`,
        neighborhood: invoice.address?.neighborhood || 'N/A',
        address: invoice.address 
          ? `${invoice.address.street}, ${invoice.address.number}${invoice.address.complement ? ` - ${invoice.address.complement}` : ''}`
          : null,
        cep: invoice.address?.cep || null,
        observation: `NF ${invoice.number}${invoice.orderObservation ? ' - ' + invoice.orderObservation : ''}`,
        date: today,
        period: period,
        order_number: 1,
        status: 'NAO_ENTREGUE' as const,
        driver_id: (driverId && driverId !== 'none') ? driverId : null,
        vehicle_id: (vehicleId && vehicleId !== 'none') ? vehicleId : null,
        consultant_id: (consultantId && consultantId !== 'none') ? consultantId : null,
        payment_method_id: (paymentMethodId && paymentMethodId !== 'none') ? paymentMethodId : null,
        urgent: urgent,
      };

      const { data, error } = await supabase
        .from('routes')
        .insert([routeToCreate])
        .select();

      if (error) throw error;

      // Save products if available
      if (invoice.products && invoice.products.length > 0 && data && data.length > 0) {
        const routeId = data[0].id;
        const productRows = invoice.products.map((p) => ({
          route_id: routeId,
          name: p.name,
          code: p.code || null,
          quantity: p.quantity,
          unit: p.unit || 'UN',
          unit_value: p.unitValue || null,
          total_value: p.totalValue || null,
        }));
        const { error: prodError } = await supabase
          .from('route_products')
          .insert(productRows);
        if (prodError) console.error('Error saving products:', prodError);
      }

      return { data, invoice };
    },
    onSuccess: ({ data, invoice }) => {
      toast.success(`Rota criada com sucesso!`);
      setCreatedInvoices(prev => {
        const next = new Set(prev);
        next.add(String(invoice.number));
        return next;
      });
      setDialogInvoice(null);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      queryClient.invalidateQueries({ queryKey: ['existing-route-nf-numbers'] });
    },
    onError: (error) => {
      toast.error(`Erro ao criar rota: ${error.message}`);
    },
  });

  const handleSearch = useCallback(() => {
    setCurrentPage(null);
    setTimeout(() => setFetchCounter(c => c + 1), 0);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    setTimeout(() => setFetchCounter(c => c + 1), 0);
  }, []);

  const resolveConsultantId = useCallback((vendedorName?: string | null): string => {
    if (!vendedorName || !consultants) return '';
    const normalized = (s: string) => s.toLowerCase().trim();
    // Try exact match first
    const exact = consultants.find(c => normalized(c.name) === normalized(vendedorName));
    if (exact) return exact.id;
    // Try partial match (vendedor name contains consultant name or vice versa)
    const partial = consultants.find(c =>
      normalized(vendedorName).includes(normalized(c.name)) ||
      normalized(c.name).includes(normalized(vendedorName))
    );
    return partial?.id || '';
  }, [consultants]);

  const handleOpenInvoiceDialog = (invoice: OmieInvoice) => {
    if (importedNfNumbers.has(String(invoice.number))) return;
    setDialogDriverId('');
    setDialogVehicleId('');
    // Auto-fill consultant from Omie vendedor
    const autoConsultantId = resolveConsultantId(invoice.vendedorName);
    setDialogConsultantId(autoConsultantId);
    // Auto-fill payment method from Omie mapping
    const autoPaymentId = resolvePaymentMethodId(invoice.paymentMethod);
    setDialogPaymentMethodId(autoPaymentId || '');
    setDialogUrgent(false);
    // Auto-detect period based on current time
    const currentHour = new Date().getHours();
    setDialogPeriod(currentHour < 12 ? 'MANHA' : 'TARDE');
    setDialogInvoice(invoice);
  };

  const handleCreateRoute = () => {
    if (!dialogInvoice) return;
    createRoutesMutation.mutate({
      invoice: dialogInvoice,
      driverId: dialogDriverId,
      vehicleId: dialogVehicleId,
      consultantId: dialogConsultantId,
      paymentMethodId: dialogPaymentMethodId,
      urgent: dialogUrgent,
      period: dialogPeriod,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    setIsExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove data:...;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('extract-invoice-data', {
        body: { fileBase64: base64, fileName: file.name, mimeType: file.type },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const extracted = data.data;
      setExtractedData(extracted);

      // Auto-resolve consultant
      const autoConsultantId = resolveConsultantId(extracted.seller_name);
      // Auto-resolve payment method
      let autoPaymentId = '';
      if (extracted.payment_method && paymentMethods) {
        const found = paymentMethods.find(pm => 
          pm.name.toLowerCase() === extracted.payment_method?.toLowerCase()
        );
        autoPaymentId = found?.id || '';
      }

      const currentHour = new Date().getHours();
      setExtractFormData({
        client: extracted.client_name || '',
        neighborhood: extracted.neighborhood || '',
        address: extracted.address || '',
        cep: extracted.cep || '',
        observation: extracted.invoice_number ? `NF ${extracted.invoice_number}${extracted.observation ? ' - ' + extracted.observation : ''}` : (extracted.observation || ''),
        driverId: '',
        vehicleId: '',
        consultantId: autoConsultantId,
        paymentMethodId: autoPaymentId,
        period: currentHour < 12 ? 'MANHA' : 'TARDE',
        urgent: false,
      });

      setExtractedProducts(
        (extracted.products || []).map((p: any) => ({
          name: p.name || '',
          code: p.code || null,
          quantity: p.quantity || 1,
          unit: p.unit || 'UN',
          unit_value: p.unit_value || null,
          total_value: p.total_value || null,
        }))
      );

      setExtractDialogOpen(true);
      toast.success('Dados extraídos com sucesso!');
    } catch (err: any) {
      toast.error(`Erro ao extrair dados: ${err.message}`);
    } finally {
      setIsExtracting(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleCreateRouteFromExtract = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const routeToCreate = {
      client: extractFormData.client || 'Cliente não identificado',
      neighborhood: extractFormData.neighborhood || 'N/A',
      address: extractFormData.address || null,
      cep: extractFormData.cep || null,
      observation: extractFormData.observation || null,
      date: today,
      period: extractFormData.period,
      order_number: 1,
      status: 'NAO_ENTREGUE' as const,
      driver_id: (extractFormData.driverId && extractFormData.driverId !== 'none') ? extractFormData.driverId : null,
      vehicle_id: (extractFormData.vehicleId && extractFormData.vehicleId !== 'none') ? extractFormData.vehicleId : null,
      consultant_id: (extractFormData.consultantId && extractFormData.consultantId !== 'none') ? extractFormData.consultantId : null,
      payment_method_id: (extractFormData.paymentMethodId && extractFormData.paymentMethodId !== 'none') ? extractFormData.paymentMethodId : null,
      urgent: extractFormData.urgent,
    };

    try {
      const { data: routeData, error } = await supabase.from('routes').insert([routeToCreate]).select();
      if (error) throw error;

      if (extractedProducts.length > 0 && routeData && routeData.length > 0) {
        const routeId = routeData[0].id;
        const productRows = extractedProducts.map((p) => ({
          route_id: routeId,
          name: p.name,
          code: p.code,
          quantity: p.quantity,
          unit: p.unit || 'UN',
          unit_value: p.unit_value,
          total_value: p.total_value,
        }));
        await supabase.from('route_products').insert(productRows);
      }

      toast.success('Rota criada com sucesso!');
      setExtractDialogOpen(false);
      setExtractedData(null);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    } catch (err: any) {
      toast.error(`Erro ao criar rota: ${err.message}`);
    }
  };

  const formatAddress = (address: OmieInvoice['address']) => {
    if (!address) return 'Endereço não disponível';
    return `${address.street}, ${address.number} - ${address.neighborhood}, ${address.city}/${address.state}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importar do Omie</h1>
          <p className="text-muted-foreground">
            Busque notas fiscais do Omie e crie rotas de entrega automaticamente
          </p>
        </div>
        <div>
          <input
            type="file"
            id="invoice-file-upload"
            className="hidden"
            accept="image/*,application/pdf,.pdf"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById('invoice-file-upload')?.click()}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extraindo...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-2" />
                Importar com Foto/PDF
              </>
            )}
          </Button>
        </div>
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

              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente ou nº NF..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
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
                      importedNfNumbers.has(String(invoice.number))
                        ? 'border-green-500 bg-green-500/10 cursor-default'
                        : 'border-border hover:border-primary/50 hover:bg-primary/5'
                    }`}
                    onClick={() => handleOpenInvoiceDialog(invoice)}
                  >
                    <div className="flex items-start gap-4">
                      
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Info da NF */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">
                              {activeTab === 'nfe' ? 'NF-e' : 'NFC-e'} #{invoice.number}
                            </span>
                            {importedNfNumbers.has(String(invoice.number)) && (
                              <Badge className="text-xs bg-green-500 text-white">
                                ✓ Rota criada
                              </Badge>
                            )}
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
                          {invoice.paymentMethod && OMIE_PAYMENT_MAP[invoice.paymentMethod] && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CreditCard className="w-3 h-3" />
                              {OMIE_PAYMENT_MAP[invoice.paymentMethod]}
                            </div>
                          )}
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
                          {invoice.vendedorName && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ShoppingCart className="w-3 h-3" />
                              Vendedor: {invoice.vendedorName}
                            </div>
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

      {/* Dialog para criar rota */}
      <Dialog open={!!dialogInvoice} onOpenChange={(open) => !open && setDialogInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Criar Rota - NF #{dialogInvoice?.number}</DialogTitle>
              {dialogInvoice?.products && dialogInvoice.products.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProductsInvoice(dialogInvoice)}
                >
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Produtos
                </Button>
              )}
            </div>
          </DialogHeader>
          {dialogInvoice && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
                <p><span className="font-medium">Cliente:</span> {dialogInvoice.clientName || `Cliente ${dialogInvoice.clientId}`}</p>
                <p><span className="font-medium">Valor:</span> R$ {dialogInvoice.totalValue?.toFixed(2)}</p>
                {dialogInvoice.address && (
                  <p><span className="font-medium">Endereço:</span> {formatAddress(dialogInvoice.address)}</p>
                )}
                {dialogInvoice.paymentMethod && OMIE_PAYMENT_MAP[dialogInvoice.paymentMethod] && (
                  <p><span className="font-medium">Pagamento:</span> {OMIE_PAYMENT_MAP[dialogInvoice.paymentMethod]}</p>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Período de Entrega</Label>
                  <Select value={dialogPeriod} onValueChange={(v) => setDialogPeriod(v as 'MANHA' | 'TARDE')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANHA">☀️ Manhã</SelectItem>
                      <SelectItem value="TARDE">🌙 Tarde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Motorista</Label>
                  <Select value={dialogDriverId} onValueChange={setDialogDriverId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motorista" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {drivers?.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Veículo</Label>
                  <Select value={dialogVehicleId} onValueChange={setDialogVehicleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {vehicles?.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Consultor</Label>
                    {dialogInvoice?.vendedorName && (
                      <span className="text-xs text-muted-foreground">
                        Omie: <span className="font-medium">{dialogInvoice.vendedorName}</span>
                      </span>
                    )}
                  </div>
                  <Select value={dialogConsultantId} onValueChange={setDialogConsultantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o consultor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {consultants?.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Forma de Pagamento</Label>
                  <Select value={dialogPaymentMethodId} onValueChange={setDialogPaymentMethodId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a forma de pagamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {paymentMethods?.map(pm => (
                        <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              variant={dialogUrgent ? "destructive" : "outline"}
              onClick={() => setDialogUrgent(!dialogUrgent)}
              type="button"
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              Urgente
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogInvoice(null)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateRoute} disabled={createRoutesMutation.isPending}>
                {createRoutesMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4 mr-2" />
                    Criar Rota
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Produtos */}
      <Dialog open={!!productsInvoice} onOpenChange={(open) => !open && setProductsInvoice(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Produtos - NF #{productsInvoice?.number}</DialogTitle>
          </DialogHeader>
          {productsInvoice?.products && (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {productsInvoice.products.map((product, idx) => (
                  <div key={idx} className="p-3 rounded-lg border bg-muted/30 space-y-1">
                    <p className="font-medium text-sm break-words whitespace-normal">{product.name}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {product.code && <span>Cód: {product.code}</span>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold text-sm">{product.quantity} {product.unit}</span>
                        <span className="text-xs text-muted-foreground ml-2">R$ {product.unitValue?.toFixed(2)} un.</span>
                        <span className="text-xs font-medium text-primary ml-2">R$ {product.totalValue?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductsInvoice(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para criar rota a partir de foto/PDF */}
      <Dialog open={extractDialogOpen} onOpenChange={setExtractDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Criar Rota - Dados Extraídos</DialogTitle>
              {extractedProducts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
                  onClick={() => setProductsInvoice({
                    id: 'extract',
                    number: 'Extraída',
                    series: '',
                    emissionDate: '',
                    clientId: 0,
                    clientName: extractFormData.client,
                    clientCpfCnpj: '',
                    address: null,
                    totalValue: 0,
                    products: extractedProducts.map(p => ({
                      name: p.name,
                      code: p.code || '',
                      quantity: p.quantity,
                      unit: p.unit,
                      unitValue: p.unit_value || 0,
                      totalValue: p.total_value || 0,
                    })),
                  } as OmieInvoice)}
                >
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Produtos ({extractedProducts.length})
                </Button>
              )}
            </div>
          </DialogHeader>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input
                  value={extractFormData.client}
                  onChange={(e) => setExtractFormData(prev => ({ ...prev, client: e.target.value }))}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="space-y-1">
                <Label>Endereço</Label>
                <Input
                  value={extractFormData.address}
                  onChange={(e) => setExtractFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Endereço"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input
                    value={extractFormData.neighborhood}
                    onChange={(e) => setExtractFormData(prev => ({ ...prev, neighborhood: e.target.value }))}
                    placeholder="Bairro"
                  />
                </div>
                <div className="space-y-1">
                  <Label>CEP</Label>
                  <Input
                    value={extractFormData.cep}
                    onChange={(e) => setExtractFormData(prev => ({ ...prev, cep: e.target.value }))}
                    placeholder="CEP"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Observação</Label>
                <Textarea
                  value={extractFormData.observation}
                  onChange={(e) => setExtractFormData(prev => ({ ...prev, observation: e.target.value }))}
                  placeholder="Observações"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <Label>Período de Entrega</Label>
                <Select value={extractFormData.period} onValueChange={(v) => setExtractFormData(prev => ({ ...prev, period: v as 'MANHA' | 'TARDE' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANHA">☀️ Manhã</SelectItem>
                    <SelectItem value="TARDE">🌙 Tarde</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Motorista</Label>
                <Select value={extractFormData.driverId} onValueChange={(v) => setExtractFormData(prev => ({ ...prev, driverId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {drivers?.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Veículo</Label>
                <Select value={extractFormData.vehicleId} onValueChange={(v) => setExtractFormData(prev => ({ ...prev, vehicleId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o veículo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {vehicles?.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Consultor</Label>
                <Select value={extractFormData.consultantId} onValueChange={(v) => setExtractFormData(prev => ({ ...prev, consultantId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o consultor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {consultants?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Forma de Pagamento</Label>
                <Select value={extractFormData.paymentMethodId} onValueChange={(v) => setExtractFormData(prev => ({ ...prev, paymentMethodId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {paymentMethods?.map(pm => (
                      <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              variant={extractFormData.urgent ? "destructive" : "outline"}
              onClick={() => setExtractFormData(prev => ({ ...prev, urgent: !prev.urgent }))}
              type="button"
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              Urgente
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setExtractDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateRouteFromExtract}>
                <Package className="w-4 h-4 mr-2" />
                Criar Rota
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
