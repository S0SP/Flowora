import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import { decrypt } from "@/lib/whatsapp/encryption"

export interface WhatsAppCredentials {
  accessToken: string
  phoneNumberId: string
  wabaId: string
  verifyToken: string
}

/**
 * Securely retrieves and decrypts the WhatsApp credentials for a given workspace.
 *
 * Storage convention (aligned with real schema):
 *   channel_connections.config (jsonb) stores:
 *     - phone_number_id, waba_id, verify_token  (plain)
 *     - access_token_enc  (encrypted hex string via lib/whatsapp/encryption.ts)
 *
 *   secrets_enc (bytea) is NOT used by our route — left null.
 */
export async function getWhatsAppCredentials(
  workspaceId: string,
  client?: SupabaseClient
): Promise<WhatsAppCredentials | null> {
  const supabase = client || (await createAdminClient())

  const { data: conn, error } = await supabase
    .from("channel_connections")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("type", "whatsapp")
    .eq("is_active", true)
    .maybeSingle()

  if (error || !conn) {
    return null
  }

  const config = conn.config as any || {}

  if (!config.access_token_enc) {
    console.warn("[getWhatsAppCredentials] No access_token_enc found for workspace:", workspaceId)
    return null
  }

  let accessToken = ""
  try {
    accessToken = decrypt(config.access_token_enc)
  } catch (e) {
    console.error("[getWhatsAppCredentials] Failed to decrypt access token for workspace:", workspaceId, e)
    return null
  }

  return {
    accessToken,
    phoneNumberId: config.phone_number_id || config.phoneNumberId || "",
    wabaId: config.waba_id || config.wabaId || "",
    verifyToken: config.verify_token || config.verifyToken || "",
  }
}
