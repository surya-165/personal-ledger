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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          opening_balance: number
          opening_date: string
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          opening_date?: string
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          opening_date?: string
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_plan: {
        Row: {
          annual_tax_estimate: number
          created_at: string
          id: string
          planned_car_emi: number
          planned_corpus_contribution: number
          planned_maintenance: number
          planned_monthly_income: number
          planned_tax_reserve: number
          planned_trip_contribution: number
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_tax_estimate?: number
          created_at?: string
          id?: string
          planned_car_emi?: number
          planned_corpus_contribution?: number
          planned_maintenance?: number
          planned_monthly_income?: number
          planned_tax_reserve?: number
          planned_trip_contribution?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_tax_estimate?: number
          created_at?: string
          id?: string
          planned_car_emi?: number
          planned_corpus_contribution?: number
          planned_maintenance?: number
          planned_monthly_income?: number
          planned_tax_reserve?: number
          planned_trip_contribution?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          bucket: string
          created_at: string
          id: string
          monthly_limit: number
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket?: string
          created_at?: string
          id?: string
          monthly_limit?: number
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          monthly_limit?: number
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funds: {
        Row: {
          account_id: string
          code: string
          created_at: string
          id: string
          monthly_target: number
          name: string
          opening_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          code: string
          created_at?: string
          id?: string
          monthly_target?: number
          name: string
          opening_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          code?: string
          created_at?: string
          id?: string
          monthly_target?: number
          name?: string
          opening_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_mappings: {
        Row: {
          created_at: string
          equity_allocation_percent: number | null
          goal_id: string
          id: string
          kite_tradingsymbol: string | null
          mapping_type: Database["public"]["Enums"]["goal_mapping_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          equity_allocation_percent?: number | null
          goal_id: string
          id?: string
          kite_tradingsymbol?: string | null
          mapping_type: Database["public"]["Enums"]["goal_mapping_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          equity_allocation_percent?: number | null
          goal_id?: string
          id?: string
          kite_tradingsymbol?: string | null
          mapping_type?: Database["public"]["Enums"]["goal_mapping_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_mappings_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          expected_return_percent: number
          id: string
          name: string
          target_amount: number
          time_frame_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_return_percent?: number
          id?: string
          name: string
          target_amount?: number
          time_frame_months?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expected_return_percent?: number
          id?: string
          name?: string
          target_amount?: number
          time_frame_months?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income_split_components: {
        Row: {
          account_id: string | null
          amount: number | null
          category_id: string | null
          component_type: Database["public"]["Enums"]["split_component_type"]
          created_at: string
          description: string | null
          destination_account_id: string | null
          fund_id: string | null
          id: string
          order_index: number
          percent: number | null
          reserve_id: string | null
          rule_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          category_id?: string | null
          component_type: Database["public"]["Enums"]["split_component_type"]
          created_at?: string
          description?: string | null
          destination_account_id?: string | null
          fund_id?: string | null
          id?: string
          order_index?: number
          percent?: number | null
          reserve_id?: string | null
          rule_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          category_id?: string | null
          component_type?: Database["public"]["Enums"]["split_component_type"]
          created_at?: string
          description?: string | null
          destination_account_id?: string | null
          fund_id?: string | null
          id?: string
          order_index?: number
          percent?: number | null
          reserve_id?: string | null
          rule_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_split_components_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_split_components_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_split_components_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_split_components_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_split_components_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "reserves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_split_components_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "income_split_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      income_split_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          source_account_id: string
          trigger_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          source_account_id: string
          trigger_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          source_account_id?: string
          trigger_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_split_rules_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          active: boolean
          created_at: string
          goal: string
          id: string
          invested_total: number
          kite_symbol: string | null
          monthly_amount: number
          name: string
          source_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          goal: string
          id?: string
          invested_total?: number
          kite_symbol?: string | null
          monthly_amount?: number
          name: string
          source_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          goal?: string
          id?: string
          invested_total?: number
          kite_symbol?: string | null
          monthly_amount?: number
          name?: string
          source_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kite_tokens: {
        Row: {
          access_token: string
          created_at: string
          kite_user_id: string | null
          public_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          kite_user_id?: string | null
          public_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          kite_user_id?: string | null
          public_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          borrower_name: string | null
          category_id: string | null
          created_at: string
          disbursement_account_id: string
          disbursement_date: string
          id: string
          loan_type: Database["public"]["Enums"]["loan_type"]
          monthly_installment: number | null
          name: string
          principal_amount: number
          repayment_account_id: string | null
          status: Database["public"]["Enums"]["loan_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          borrower_name?: string | null
          category_id?: string | null
          created_at?: string
          disbursement_account_id: string
          disbursement_date: string
          id?: string
          loan_type: Database["public"]["Enums"]["loan_type"]
          monthly_installment?: number | null
          name: string
          principal_amount: number
          repayment_account_id?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          borrower_name?: string | null
          category_id?: string | null
          created_at?: string
          disbursement_account_id?: string
          disbursement_date?: string
          id?: string
          loan_type?: Database["public"]["Enums"]["loan_type"]
          monthly_installment?: number | null
          name?: string
          principal_amount?: number
          repayment_account_id?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_disbursement_account_id_fkey"
            columns: ["disbursement_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_repayment_account_id_fkey"
            columns: ["repayment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      month_closures: {
        Row: {
          closed_at: string
          created_at: string
          id: string
          month: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_templates: {
        Row: {
          account_id: string
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number | null
          destination_account_id: string | null
          fund_id: string | null
          id: string
          name: string
          reserve_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          destination_account_id?: string | null
          fund_id?: string | null
          id?: string
          name: string
          reserve_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number | null
          destination_account_id?: string | null
          fund_id?: string | null
          id?: string
          name?: string
          reserve_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "reserves"
            referencedColumns: ["id"]
          },
        ]
      }
      reserves: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reserve_kind"]
          monthly_accrual: number | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount?: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["reserve_kind"]
          monthly_accrual?: number | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reserve_kind"]
          monthly_accrual?: number | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reserves_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      surplus_entries: {
        Row: {
          actual_amount: number
          bucket: string
          closure_id: string
          created_at: string
          destination_account_id: string | null
          destination_note: string | null
          id: string
          month: string
          planned_amount: number
          source_account_id: string | null
          surplus_amount: number
          transfer_transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_amount?: number
          bucket: string
          closure_id: string
          created_at?: string
          destination_account_id?: string | null
          destination_note?: string | null
          id?: string
          month: string
          planned_amount?: number
          source_account_id?: string | null
          surplus_amount?: number
          transfer_transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_amount?: number
          bucket?: string
          closure_id?: string
          created_at?: string
          destination_account_id?: string | null
          destination_note?: string | null
          id?: string
          month?: string
          planned_amount?: number
          source_account_id?: string | null
          surplus_amount?: number
          transfer_transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "surplus_entries_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "month_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_entries_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_entries_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_entries_transfer_transaction_id_fkey"
            columns: ["transfer_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          bucket: string | null
          category_id: string | null
          created_at: string
          date: string
          description: string
          destination_account_id: string | null
          fund_id: string | null
          id: string
          loan_id: string | null
          payment_mode: string | null
          reserve_id: string | null
          sub_category: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          bucket?: string | null
          category_id?: string | null
          created_at?: string
          date: string
          description?: string
          destination_account_id?: string | null
          fund_id?: string | null
          id?: string
          loan_id?: string | null
          payment_mode?: string | null
          reserve_id?: string | null
          sub_category?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          bucket?: string | null
          category_id?: string | null
          created_at?: string
          date?: string
          description?: string
          destination_account_id?: string | null
          fund_id?: string | null
          id?: string
          loan_id?: string | null
          payment_mode?: string | null
          reserve_id?: string | null
          sub_category?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "reserves"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      goal_mapping_type: "mf_holding" | "equity"
      loan_status: "active" | "settled"
      loan_type: "external" | "internal"
      reserve_kind: "floor" | "accrual"
      split_component_type:
        | "expense"
        | "reserve_accrual"
        | "fund_contribution"
        | "transfer"
      transaction_type:
        | "income"
        | "expense"
        | "transfer"
        | "fund_contribution"
        | "fund_withdrawal"
        | "reserve_accrual"
        | "loan_given"
        | "loan_received"
        | "internal_loan_repayment"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      goal_mapping_type: ["mf_holding", "equity"],
      loan_status: ["active", "settled"],
      loan_type: ["external", "internal"],
      reserve_kind: ["floor", "accrual"],
      split_component_type: [
        "expense",
        "reserve_accrual",
        "fund_contribution",
        "transfer",
      ],
      transaction_type: [
        "income",
        "expense",
        "transfer",
        "fund_contribution",
        "fund_withdrawal",
        "reserve_accrual",
        "loan_given",
        "loan_received",
        "internal_loan_repayment",
      ],
    },
  },
} as const
