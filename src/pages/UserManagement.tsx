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
import { Loader2, Shield, User, ArrowLeft, Settings, Truck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Profile = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  user_roles: Array<{ role: 'admin' | 'user' | 'motorista' | 'comercial' }>;
};

export default function UserManagement() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'user' | 'motorista' | 'comercial' }) => {
      // Delete current role
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insert new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({
        title: "Permissão atualizada",
        description: "O nível de acesso do usuário foi alterado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar permissão",
        description: error.message,
        variant: "destructive",
      });
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
                          ) : (
                            <><User className="mr-1 h-3 w-3" /> Usuário</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(profile.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          value={role}
                          onValueChange={(newRole) => {
                            toggleRoleMutation.mutate({
                              userId: profile.id,
                              newRole: newRole as 'admin' | 'user' | 'motorista' | 'comercial',
                            });
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center">
                                <Shield className="mr-2 h-4 w-4" />
                                Administrador
                              </div>
                            </SelectItem>
                            <SelectItem value="motorista">
                              <div className="flex items-center">
                                <Truck className="mr-2 h-4 w-4" />
                                Motorista
                              </div>
                            </SelectItem>
                            <SelectItem value="comercial">
                              <div className="flex items-center">
                                <User className="mr-2 h-4 w-4" />
                                Comercial
                              </div>
                            </SelectItem>
                            <SelectItem value="user">
                              <div className="flex items-center">
                                <User className="mr-2 h-4 w-4" />
                                Usuário
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
