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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_provider_settings: {
        Row: {
          created_at: string
          encrypted_api_key: string
          id: string
          is_default: boolean
          model: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_api_key: string
          id?: string
          is_default?: boolean
          model: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_api_key?: string
          id?: string
          is_default?: boolean
          model?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          created_at: string
          estimated_cost_usd: number | null
          feature_type: string
          id: string
          input_tokens: number | null
          model_used: string
          output_tokens: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number | null
          feature_type: string
          id?: string
          input_tokens?: number | null
          model_used: string
          output_tokens?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number | null
          feature_type?: string
          id?: string
          input_tokens?: number | null
          model_used?: string
          output_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      chip_memories: {
        Row: {
          created_at: string
          id: string
          memory_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memory_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memory_text?: string
          user_id?: string
        }
        Relationships: []
      }
      machine_sales: {
        Row: {
          cash_amount: number
          created_at: string
          credit_amount: number
          date: string
          id: string
          machine_id: string
          user_id: string
        }
        Insert: {
          cash_amount?: number
          created_at?: string
          credit_amount?: number
          date: string
          id?: string
          machine_id: string
          user_id: string
        }
        Update: {
          cash_amount?: number
          created_at?: string
          credit_amount?: number
          date?: string
          id?: string
          machine_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_sales_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_skus: {
        Row: {
          created_at: string
          id: string
          machine_id: string
          sku_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          machine_id: string
          sku_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          machine_id?: string
          sku_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_skus_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_skus_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          created_at: string
          id: string
          is_personal: boolean
          line_total: number
          needs_review: boolean
          normalized_name: string | null
          pack_size: number | null
          pack_size_uom: string | null
          qty: number
          raw_name: string
          receipt_id: string
          sku_id: string | null
          unit_cost: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_personal?: boolean
          line_total: number
          needs_review?: boolean
          normalized_name?: string | null
          pack_size?: number | null
          pack_size_uom?: string | null
          qty?: number
          raw_name: string
          receipt_id: string
          sku_id?: string | null
          unit_cost?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_personal?: boolean
          line_total?: number
          needs_review?: boolean
          normalized_name?: string | null
          pack_size?: number | null
          pack_size_uom?: string | null
          qty?: number
          raw_name?: string
          receipt_id?: string
          sku_id?: string | null
          unit_cost?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          id: string
          item_count: number | null
          parse_status: Database["public"]["Enums"]["parse_status_type"]
          pdf_url: string | null
          receipt_date: string
          receipt_identifier: string | null
          receipt_type: Database["public"]["Enums"]["receipt_type"] | null
          store_location: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string
          user_id: string
          vendor: Database["public"]["Enums"]["vendor_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          item_count?: number | null
          parse_status?: Database["public"]["Enums"]["parse_status_type"]
          pdf_url?: string | null
          receipt_date: string
          receipt_identifier?: string | null
          receipt_type?: Database["public"]["Enums"]["receipt_type"] | null
          store_location?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          user_id: string
          vendor: Database["public"]["Enums"]["vendor_type"]
        }
        Update: {
          created_at?: string
          id?: string
          item_count?: number | null
          parse_status?: Database["public"]["Enums"]["parse_status_type"]
          pdf_url?: string | null
          receipt_date?: string
          receipt_identifier?: string | null
          receipt_type?: Database["public"]["Enums"]["receipt_type"] | null
          store_location?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string
          vendor?: Database["public"]["Enums"]["vendor_type"]
        }
        Relationships: []
      }
      restock_warnings_shown: {
        Row: {
          alert_key: string | null
          created_at: string
          feature_type: string
          id: string
          shown_date: string
          sku_id: string | null
          user_id: string
        }
        Insert: {
          alert_key?: string | null
          created_at?: string
          feature_type?: string
          id?: string
          shown_date?: string
          sku_id?: string | null
          user_id: string
        }
        Update: {
          alert_key?: string | null
          created_at?: string
          feature_type?: string
          id?: string
          shown_date?: string
          sku_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sku_aliases: {
        Row: {
          created_at: string
          id: string
          pack_size_override: number | null
          raw_name_pattern: string
          sku_id: string
          vendor: Database["public"]["Enums"]["vendor_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          pack_size_override?: number | null
          raw_name_pattern: string
          sku_id: string
          vendor: Database["public"]["Enums"]["vendor_type"]
        }
        Update: {
          created_at?: string
          id?: string
          pack_size_override?: number | null
          raw_name_pattern?: string
          sku_id?: string
          vendor?: Database["public"]["Enums"]["vendor_type"]
        }
        Relationships: [
          {
            foreignKeyName: "sku_aliases_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          category: string | null
          created_at: string
          default_is_personal: boolean
          id: string
          rebuy_status: Database["public"]["Enums"]["rebuy_status_type"]
          sell_price: number | null
          sku_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_is_personal?: boolean
          id?: string
          rebuy_status?: Database["public"]["Enums"]["rebuy_status_type"]
          sell_price?: number | null
          sku_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_is_personal?: boolean
          id?: string
          rebuy_status?: Database["public"]["Enums"]["rebuy_status_type"]
          sell_price?: number | null
          sku_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          week_start_day: number
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          week_start_day?: number
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          week_start_day?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_ai_key: {
        Args: { enc_key: string; encrypted_text: string }
        Returns: string
      }
      encrypt_ai_key: {
        Args: { enc_key: string; plain_text: string }
        Returns: string
      }
      evaluate_test_skus: {
        Args: { p_user_id: string }
        Returns: {
          new_status: string
          old_status: string
          sku_id: string
          sku_name: string
        }[]
      }
      is_admin_user: { Args: never; Returns: boolean }
    }
    Enums: {
      parse_status_type: "PENDING" | "PARSED" | "PARTIAL_PARSE" | "FAILED"
      rebuy_status_type: "Rebuy" | "Test" | "Do Not Rebuy" | "Core" | "Failed"
      receipt_type: "sams_scan_and_go" | "walmart_store" | "walmart_delivery"
      vendor_type: "sams" | "walmart" | "other"
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
      parse_status_type: ["PENDING", "PARSED", "PARTIAL_PARSE", "FAILED"],
      rebuy_status_type: ["Rebuy", "Test", "Do Not Rebuy", "Core", "Failed"],
      receipt_type: ["sams_scan_and_go", "walmart_store", "walmart_delivery"],
      vendor_type: ["sams", "walmart", "other"],
    },
  },
} as const
