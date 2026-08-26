import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, User, ArrowLeft, Settings, Truck, Pencil, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2 } from "lucide-react";

type AppRole = 'admin' | 'user' | 'motorista' | 'comercial' | 'expedicao';

type Profile = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  user_roles: Array<{ role: AppRole }>;
};

export default function UserManagement() {
  const { isAdmin, user: currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [deleting, setDeleting] = useState<Profile | null>(null);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          created_at,
          user_roles (role)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Profile[];
    },
    enabled: !authLoading && isAdmin,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['all-companies'],
    enabled: !authLoading && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ['all-user-companies'],
    enabled: !authLoading && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_companies').select('user_id, company_id');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleCompanyMutation = useMutation({
    mutationFn: async ({ userId, companyId, enabled }: { userId: string; companyId: string; enabled: boolean }) => {
      if (enabled) {
        const { error } = await supabase.from('user_companies').insert({ user_id: userId, company_id: companyId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_companies')
          .delete()
          .eq('user_id', userId)
          .eq('company_id', companyId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-companies'] });
      toast({ title: "Empresas atualizadas" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar empresas", description: error.message, variant: "destructive" });
    },
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: "Permissão atualizada", description: "O nível de acesso do usuário foi alterado com sucesso." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar permissão", description: error.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ userId, fullName, email }: { userId: string; fullName: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke('admin-update-user', { body: { userId, fullName, email } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: "Usuário atualizado" });
      setEditing(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: "Usuário excluído" });
      setDeleting(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    navigate("/");
    return null;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
            <p className="text-muted-foreground">
              Gerencie permissões e acessos dos usuários do sistema
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/settings")}>
          <Settings className="w-4 h-4 mr-2" />
          Configurações
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários Cadastrados</CardTitle>
          <CardDescription>
            Lista de todos os usuários e suas permissões de acesso
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Nível de Acesso</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead>Data de Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles?.map((profile) => {
                  const role = profile.user_roles[0]?.role || 'user';
                  const isCurrentAdmin = role === 'admin';
                  const isCurrentMotorista = role === 'motorista';
                  const isCurrentComercial = role === 'comercial';
                  const isSelf = profile.id === currentUser?.id;

                  return (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.full_name}</TableCell>
                      <TableCell>{profile.email}</TableCell>
                      <TableCell>
                        <Badge variant={isCurrentAdmin ? "default" : (isCurrentMotorista || isCurrentComercial) ? "outline" : "secondary"}>
                          {isCurrentAdmin ? (
                            <><Shield className="mr-1 h-3 w-3" /> Administrador</>
                          ) : isCurrentMotorista ? (
                            <><Truck className="mr-1 h-3 w-3" /> Motorista</>
                          ) : isCurrentComercial ? (
                            <><User className="mr-1 h-3 w-3" /> Comercial</>
                          ) : role === 'expedicao' ? (
                            <><Building2 className="mr-1 h-3 w-3" /> Expedição</>
                          ) : (
                            <><User className="mr-1 h-3 w-3" /> Usuário</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Building2 className="mr-2 h-4 w-4" />
                              {memberships.filter((m: any) => m.user_id === profile.id).length} empresa(s)
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 space-y-2">
                            {companies.map((c: any) => {
                              const checked = memberships.some(
                                (m: any) => m.user_id === profile.id && m.company_id === c.id
                              );
                              return (
                                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) =>
                                      toggleCompanyMutation.mutate({
                                        userId: profile.id,
                                        companyId: c.id,
                                        enabled: !!v,
                                      })
                                    }
                                  />
                                  {c.name}
                                </label>
                              );
                            })}
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={role}
                            onValueChange={(newRole) => {
                              toggleRoleMutation.mutate({
                                userId: profile.id,
                                newRole: newRole as AppRole,
                              });
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin"><div className="flex items-center"><Shield className="mr-2 h-4 w-4" />Administrador</div></SelectItem>
                              <SelectItem value="motorista"><div className="flex items-center"><Truck className="mr-2 h-4 w-4" />Motorista</div></SelectItem>
                              <SelectItem value="comercial"><div className="flex items-center"><User className="mr-2 h-4 w-4" />Comercial</div></SelectItem>
                              <SelectItem value="expedicao"><div className="flex items-center"><Building2 className="mr-2 h-4 w-4" />Expedição</div></SelectItem>
                              <SelectItem value="user"><div className="flex items-center"><User className="mr-2 h-4 w-4" />Usuário</div></SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => { setEditing(profile); setEditName(profile.full_name); setEditEmail(profile.email); }}
                            title="Editar nome"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setDeleting(profile)}
                            disabled={isSelf}
                            title={isSelf ? "Não é possível excluir o próprio usuário" : "Excluir usuário"}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              onClick={() => editing && editMutation.mutate({ userId: editing.id, fullName: editName, email: editEmail })}
              disabled={editMutation.isPending || !editName.trim() || !editEmail.trim()}
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O usuário <strong>{deleting?.full_name}</strong> ({deleting?.email}) será permanentemente removido do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleting && deleteMutation.mutate(deleting.id); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
