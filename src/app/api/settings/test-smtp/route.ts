import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getTenant, TenantError } from "@/lib/tenant"
import { decrypt, parseSecrets } from "@/lib/crypto"
import nodemailer from "nodemailer"

export async function POST(req: NextRequest) {
  try {
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

    const { host, port, user: smtpUser, password } = await req.json()

    let finalPass = password
    
    if (!finalPass || finalPass === "••••••••••••••••") {
      const admin = await createAdminClient()
      const { data: connection } = await admin
        .from("channel_connections")
        .select("secrets")
        .eq("workspace_id", ctx.workspaceId)
        .eq("type", "email")
        .maybeSingle()
        
      if (!connection) {
        return NextResponse.json({ error: "No password provided and no saved connection found." }, { status: 400 })
      }
      
      try {
        const secrets = parseSecrets(connection.secrets)
        if (secrets.password) {
          finalPass = await decrypt(secrets.password)
        }
      } catch(e) {
        return NextResponse.json({ error: "Failed to decrypt saved password." }, { status: 500 })
      }
    }
    
    if (!host || !port || !smtpUser || !finalPass) {
      return NextResponse.json({ error: "Missing SMTP credentials for testing." }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: {
        user: smtpUser,
        pass: finalPass,
      }
    })

    await transporter.verify()
    
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[test-smtp] Error:", err)
    return NextResponse.json({ error: err.message || "Failed to verify SMTP connection" }, { status: 500 })
  }
}
