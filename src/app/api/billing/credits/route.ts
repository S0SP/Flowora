import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getTenant, TenantError } from "@/lib/tenant"

// GET /api/billing/credits — get wallet balance + recent ledger
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let ctx;
  try {
    ctx = await getTenant()
  } catch (err: any) {
    const status = err instanceof TenantError ? err.status : 500
    return NextResponse.json({ error: err.message }, { status })
  }

  const [walletRes, ledgerRes] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select("balance, reserved, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .single(),
    supabase
      .from("credit_ledger")
      .select("id, type, operation, amount, balance_after, meta, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  return NextResponse.json({
    wallet: walletRes.data ?? { balance: 0, reserved: 0 },
    ledger: ledgerRes.data ?? [],
  })
}
