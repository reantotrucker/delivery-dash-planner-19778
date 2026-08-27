import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, CheckCircle2, XCircle, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ProductChecklistDialogProps {
  routeId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RouteProduct {
  id: string;
  route_id: string;
  name: string;
  code: string | null;
  family: string | null;
  quantity: number;
  unit: string | null;
  unit_value: number | null;
  total_value: number | null;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  checked2: boolean;
  checked2_at: string | null;
  checked2_by: string | null;
}

export const ProductChecklistDialog = ({
  routeId,
  clientName,
  open,
  onOpenChange,
}: ProductChecklistDialogProps) => {
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["route-products", routeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_products")
        .select("*")
        .eq("route_id", routeId)
        .order("created_at");
      if (error) throw error;
      return data as RouteProduct[];
    },
    enabled: open,
  });

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: Infinity,
  });

  // Fetch profile names for all checked_by user ids (both checks)
  const allCheckedByIds = [
    ...new Set(
      products
        .flatMap(p => [p.checked_by, p.checked2_by])
        .filter(Boolean) as string[]
    ),
  ];
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-checklist", allCheckedByIds],
    queryFn: async () => {
      if (allCheckedByIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", allCheckedByIds);
      if (error) throw error;
      return data;
    },
    enabled: open && allCheckedByIds.length > 0,
  });

  const getCheckedByName = (userId: string | null) => {
    if (!userId) return null;
    if (currentUser && userId === currentUser.id) {
      return currentUser.user_metadata?.full_name || currentUser.email || "Usuário";
    }
    const profile = profiles.find(p => p.id === userId);
    return profile?.full_name || profile?.email || "Usuário";
  };

  const toggleCheck1 = useMutation({
    mutationFn: async ({ productId, checked }: { productId: string; checked: boolean }) => {
      const { error } = await supabase
        .from("route_products")
        .update({
          checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? currentUser?.id ?? null : null,
        })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-products", routeId] });
      queryClient.invalidateQueries({ queryKey: ["profiles-for-checklist"] });
      queryClient.invalidateQueries({ queryKey: ["route-product-counts"] });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar 1ª conferência", variant: "destructive" });
    },
  });

  const toggleCheck2 = useMutation({
    mutationFn: async ({ productId, checked2 }: { productId: string; checked2: boolean }) => {
      const { error } = await supabase
        .from("route_products")
        .update({
          checked2,
          checked2_at: checked2 ? new Date().toISOString() : null,
          checked2_by: checked2 ? currentUser?.id ?? null : null,
        } as any)
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["route-products", routeId] });
      queryClient.invalidateQueries({ queryKey: ["profiles-for-checklist"] });
      queryClient.invalidateQueries({ queryKey: ["route-product-counts"] });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar 2ª conferência", variant: "destructive" });
    },
  });

  const checked1Count = products.filter((p) => p.checked).length;
  const checked2Count = products.filter((p) => p.checked2).length;
  const totalCount = products.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Conferência de Produtos
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{clientName}</p>
          {totalCount > 0 && (
            <div className="space-y-1.5 mt-1">
              {/* 1ª Conferência - Verde */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-600 dark:text-green-400 w-24 shrink-0">
                  1ª Conf.
                </span>
                <span className="text-xs font-medium w-10 text-right">
                  {checked1Count}/{totalCount}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300 rounded-full"
                    style={{ width: `${totalCount > 0 ? (checked1Count / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {/* 2ª Conferência - Azul */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 w-24 shrink-0">
                  2ª Conf.
                </span>
                <span className="text-xs font-medium w-10 text-right">
                  {checked2Count}/{totalCount}
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                    style={{ width: `${totalCount > 0 ? (checked2Count / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Carregando produtos...</div>
        ) : products.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum produto cadastrado para esta rota</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {products.map((product) => {
                const bothChecked = product.checked && product.checked2;
                const oneChecked = product.checked || product.checked2;
                const borderClass = bothChecked
                  ? "border-blue-500 bg-blue-500/10"
                  : product.checked
                    ? "border-green-500 bg-green-500/10"
                    : "border-red-500 bg-red-500/10";

                return (
                  <div
                    key={product.id}
                    className={`p-3 rounded-lg border transition-all duration-200 ${borderClass}`}
                  >
                    {/* Product info */}
                    <div className="flex-1 min-w-0 mb-2">
                      <p className="text-sm font-medium break-words">
                        {product.name}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {product.code && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground/80">
                              {product.code}
                            </span>
                          )}
                          {product.family && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {product.family}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-sm">
                            {product.quantity} {product.unit}
                          </span>
                          {product.unit_value != null && (
                            <span className="text-xs text-muted-foreground ml-2">
                              R$ {Number(product.unit_value).toFixed(2)} un.
                            </span>
                          )}
                          {product.total_value != null && (
                            <span className="text-xs font-medium text-primary ml-2">
                              R$ {Number(product.total_value).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Two check buttons */}
                    <div className="flex gap-2 mt-2">
                      {/* 1ª Conferência - Verde */}
                      <button
                        onClick={() => toggleCheck1.mutate({ productId: product.id, checked: !product.checked })}
                        className={`flex-1 flex items-center gap-2 p-2 rounded-md border transition-all text-xs font-medium ${
                          product.checked
                            ? "border-green-500 bg-green-500/20 text-green-700 dark:text-green-400"
                            : "border-muted bg-muted/30 text-muted-foreground hover:border-green-400"
                        }`}
                      >
                        {product.checked ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="text-left min-w-0">
                          <div>1ª Conf.</div>
                          {product.checked && product.checked_by && (
                            <div className="flex items-center gap-1 mt-0.5 truncate">
                              <User className="w-3 h-3 shrink-0" />
                              <span className="truncate">{getCheckedByName(product.checked_by)}</span>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* 2ª Conferência - Azul */}
                      <button
                        onClick={() => toggleCheck2.mutate({ productId: product.id, checked2: !product.checked2 })}
                        className={`flex-1 flex items-center gap-2 p-2 rounded-md border transition-all text-xs font-medium ${
                          product.checked2
                            ? "border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-400"
                            : "border-muted bg-muted/30 text-muted-foreground hover:border-blue-400"
                        }`}
                      >
                        {product.checked2 ? (
                          <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="text-left min-w-0">
                          <div>2ª Conf.</div>
                          {product.checked2 && product.checked2_by && (
                            <div className="flex items-center gap-1 mt-0.5 truncate">
                              <User className="w-3 h-3 shrink-0" />
                              <span className="truncate">{getCheckedByName(product.checked2_by)}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
