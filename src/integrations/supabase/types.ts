export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      consultants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      omie_cache: {
        Row: {
          cache_key: string
          cache_value: Json
          created_at: string
          expires_at: string
        }
        Insert: {
          cache_key: string
          cache_value: Json
          created_at?: string
          expires_at?: string
        }
        Update: {
          cache_key?: string
          cache_value?: Json
          created_at?: string
          expires_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      route_occurrence_photos: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          occurrence_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          occurrence_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          occurrence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_occurrence_photos_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "route_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      route_occurrences: {
        Row: {
          cliente: boolean
          created_at: string
          created_by: string | null
          description: string
          id: string
          motorista: boolean
          route_id: string
          updated_at: string
          vendedor: boolean
        }
        Insert: {
          cliente?: boolean
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          motorista?: boolean
          route_id: string
          updated_at?: string
          vendedor?: boolean
        }
        Update: {
          cliente?: boolean
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          motorista?: boolean
          route_id?: string
          updated_at?: string
          vendedor?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "route_occurrences_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_products: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          checked2: boolean
          checked2_at: string | null
          checked2_by: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          quantity: number
          route_id: string
          total_value: number | null
          unit: string | null
          unit_value: number | null
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          checked2?: boolean
          checked2_at?: string | null
          checked2_by?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          quantity?: number
          route_id: string
          total_value?: number | null
          unit?: string | null
          unit_value?: number | null
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          checked2?: boolean
          checked2_at?: string | null
          checked2_by?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          quantity?: number
          route_id?: string
          total_value?: number | null
          unit?: string | null
          unit_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "route_products_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_receipts: {
        Row: {
          created_at: string
          expires_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          route_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          route_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          route_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      routes: {
        Row: {
          address: string | null
          cep: string | null
          client: string
          consultant_id: string | null
          created_at: string | null
          date: string
          driver_id: string | null
          id: string
          location_link: string | null
          neighborhood: string
          observation: string | null
          order_number: number | null
          payment_method_id: string | null
          period: Database["public"]["Enums"]["period_type"]
          status: Database["public"]["Enums"]["status_type"] | null
          updated_at: string | null
          urgent: boolean
          vehicle_id: string | null
        }
        Insert: {
          address?: string | null
          cep?: string | null
          client: string
          consultant_id?: string | null
          created_at?: string | null
          date?: string
          driver_id?: string | null
          id?: string
          location_link?: string | null
          neighborhood: string
          observation?: string | null
          order_number?: number | null
          payment_method_id?: string | null
          period: Database["public"]["Enums"]["period_type"]
          status?: Database["public"]["Enums"]["status_type"] | null
          updated_at?: string | null
          urgent?: boolean
          vehicle_id?: string | null
        }
        Update: {
          address?: string | null
          cep?: string | null
          client?: string
          consultant_id?: string | null
          created_at?: string | null
          date?: string
          driver_id?: string | null
          id?: string
          location_link?: string | null
          neighborhood?: string
          observation?: string | null
          order_number?: number | null
          payment_method_id?: string | null
          period?: Database["public"]["Enums"]["period_type"]
          status?: Database["public"]["Enums"]["status_type"] | null
          updated_at?: string | null
          urgent?: boolean
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string | null
          id: string
          plate: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          plate: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          plate?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_omie_cache: { Args: never; Returns: undefined }
      cleanup_expired_receipts: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "motorista" | "comercial"
      period_type: "MANHA" | "TARDE"
      status_type: "ENTREGUE" | "NAO_ENTREGUE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "motorista", "comercial"],
      period_type: ["MANHA", "TARDE"],
      status_type: ["ENTREGUE", "NAO_ENTREGUE"],
    },
  },
} as const
