/**
 * Flowora — Stripe client singleton.
 * Used for: subscriptions, credit top-ups, invoices, webhook verification.
 *
 * Install: npm install stripe
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *
 * NOTE: We use Razorpay env vars for INR billing but Stripe as the primary
 * integration because the schema references Stripe. Switch stripe.ts to use
 * Razorpay SDK if needed — the service interface stays the same.
 */

import Stripe from 'stripe'
import { NextRequest } from 'next/server'

let _stripe: Stripe | null = null

export function stripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY env var is required for billing features')
  }
  _stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' as any, typescript: true })
  return _stripe
}

/**
 * Verify a Stripe webhook signature and return the event.
 * Returns null if verification fails — route should return 400.
 */
export async function parseStripeWebhook(req: NextRequest): Promise<Stripe.Event | null> {
  try {
    const body = await req.text()
    const sig = req.headers.get('stripe-signature') ?? ''
    const secret = process.env.STRIPE_WEBHOOK_SECRET!
    return stripe().webhooks.constructEvent(body, sig, secret) as Stripe.Event
  } catch (err) {
    console.error('[stripe] webhook verification failed', err)
    return null
  }
}

// Plan price IDs (configured in Stripe dashboard, referenced in DB plans table)
export const STRIPE_PRICE_IDS = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
  business_monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? '',
  credit_pack_1000: process.env.STRIPE_PRICE_CREDIT_1000 ?? '',
  credit_pack_5000: process.env.STRIPE_PRICE_CREDIT_5000 ?? '',
}
