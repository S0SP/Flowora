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
 * Uses the provided supabase client, or falls back to creating an admin client.
 */
export async function getWhatsAppCredentials(
  workspaceId: string,
  client?: SupabaseClient
): Promise<WhatsAppCredentials | null> {
  const supabase = client || (await createAdminClient())

  const { data: conn, error } = await supabase
    .from("channel_connections")
    .select("config, secrets_enc")
    .eq("workspace_id", workspaceId)
    .eq("type", "whatsapp")
    .eq("is_active", true)
    .maybeSingle()

  if (error || !conn) {
    return null
  }

  let accessToken = ""
  if (conn.secrets_enc?.access_token) {
    try {
      accessToken = decrypt(conn.secrets_enc.access_token)
    } catch (e) {
      console.error("[getWhatsAppCredentials] Failed to decrypt access token for workspace:", workspaceId, e)
      return null
    }
  }

  const config = conn.config as any || {}

  return {
    accessToken,
    phoneNumberId: config.phone_number_id || config.phoneNumberId || "",
    wabaId: config.waba_id || config.wabaId || "",
    verifyToken: config.verify_token || config.verifyToken || "",
  }
}
