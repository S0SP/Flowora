import { NextRequest, NextResponse } from "next/server"
import { parseStripeWebhook } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const event = await parseStripeWebhook(req)
  if (!event) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const admin = await createAdminClient()

  switch (event.type) {
    // ── Customer subscription created / updated ───────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as any
      const workspaceId = sub.metadata?.workspace_id
      if (!workspaceId) break

      const plan = sub.metadata?.plan ?? "pro"
      const status = sub.status // active|past_due|canceled|trialing

      await admin.from("workspaces").update({
        plan: status === "active" || status === "trialing" ? plan : "trial",
        plan_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
      }).eq("id", workspaceId)

      console.log(`[Stripe] ${event.type} for workspace ${workspaceId} → ${plan}`)
      break
    }

    // ── Subscription cancelled ────────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as any
      const workspaceId = sub.metadata?.workspace_id
      if (!workspaceId) break

      await admin.from("workspaces").update({ plan: "trial", plan_expires_at: null }).eq("id", workspaceId)
      console.log(`[Stripe] Subscription cancelled for workspace ${workspaceId}`)
      break
    }

    // ── One-time credit purchase ─────────────────────────────────────
    case "payment_intent.succeeded": {
      const intent = event.data.object as any
      const workspaceId = intent.metadata?.workspace_id
      const credits = parseInt(intent.metadata?.credits ?? "0")

      if (!workspaceId || credits <= 0) break

      const { data: wallet } = await admin
        .from("credit_wallets")
        .select("balance")
        .eq("workspace_id", workspaceId)
        .single()

      const newBalance = (wallet?.balance ?? 0) + credits

      await admin.from("credit_wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)

      await admin.from("credit_ledger").insert({
        workspace_id: workspaceId,
        type: "purchase",
        amount: credits,
        balance_after: newBalance,
        meta: {
          stripe_payment_intent: intent.id,
          amount_paid: intent.amount / 100,
          currency: intent.currency,
        },
      })

      console.log(`[Stripe] Credited ${credits} credits to workspace ${workspaceId}`)
      break
    }

    // ── Payment failed ───────────────────────────────────────────────
    case "payment_intent.payment_failed": {
      const intent = event.data.object as any
      const workspaceId = intent.metadata?.workspace_id
      if (!workspaceId) break
      console.warn(`[Stripe] Payment failed for workspace ${workspaceId}`, intent.last_payment_error?.message)
      break
    }

    default:
      // Ignore other events
      break
  }

  return NextResponse.json({ received: true })
}
