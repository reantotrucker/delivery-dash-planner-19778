import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Package, CheckCircle2, XCircle, User } from "lucide-react";
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
  quantity: number;
  unit: string | null;
  unit_value: number | null;
  total_value: number | null;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
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

  // Fetch profile names for checked_by user ids
  const checkedByIds = [...new Set(products.filter(p => p.checked_by).map(p => p.checked_by!))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-checklist", checkedByIds],
    queryFn: async () => {
      if (checkedByIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", checkedByIds);
      if (error) throw error;
      return data;
    },
    enabled: open && checkedByIds.length > 0,
  });

  const getCheckedByName = (userId: string | null) => {
    if (!userId) return null;
    const profile = profiles.find(p => p.id === userId);
    return profile?.full_name || profile?.email || "Usuário";
  };

  const toggleMutation = useMutation({
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
    },
    onError: () => {
      toast({ title: "Erro ao atualizar conferência", variant: "destructive" });
    },
  });

  const checkedCount = products.filter((p) => p.checked).length;
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
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-medium">
                {checkedCount}/{totalCount} conferidos
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-300 rounded-full"
                  style={{ width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` }}
                />
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
              {products.map((product) => (
                <button
                  key={product.id}
                  onClick={() =>
                    toggleMutation.mutate({
                      productId: product.id,
                      checked: !product.checked,
                    })
                  }
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                    product.checked
                      ? "border-green-500 bg-green-500/10"
                      : "border-red-500 bg-red-500/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {product.checked ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium break-words ${
                          product.checked ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {product.name}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-muted-foreground">
                          {product.code && <span>Cód: {product.code}</span>}
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
                      {product.checked && product.checked_by && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          <span>Conferido por: {getCheckedByName(product.checked_by)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
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
