import { createAdminClient } from "@/lib/supabase/server";
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth";

const META_API = "https://graph.facebook.com/v19.0";

async function getMetaKeys(workspaceId: string) {
  const admin = await createAdminClient();
  const credentials = await getWhatsAppCredentials(workspaceId, admin);

  const token = credentials?.accessToken;
  const phoneId = credentials?.phoneNumberId;

  if (!token || !phoneId) {
    throw new Error("Meta API keys are missing for this workspace");
  }
  return {
    meta_access_token: token,
    meta_phone_number_id: phoneId,
    waba_id: credentials?.wabaId,
  };
}

export async function getMetaTemplates(workspaceId: string) {
  const keys = await getMetaKeys(workspaceId);

  if (!keys.waba_id) {
    throw new Error("WhatsApp Business Account ID (WABA ID) is not configured.");
  }

  const url = `${META_API}/${keys.waba_id}/message_templates?limit=250&fields=id,name,status,language,category,quality_score,components,rejection_reason`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${keys.meta_access_token}` },
  });

  if (!res.ok) {
    let errMsg = `Meta API error: ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error?.message) errMsg = err.error.message;
    } catch {}
    throw new Error(errMsg);
  }

  const raw = await res.json();
  return raw.data ?? [];
}

export async function initiateWhatsAppCall(workspaceId: string, phone: string) {
  const keys = await getMetaKeys(workspaceId);

  const res = await fetch(`${META_API}/${keys.meta_phone_number_id}/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keys.meta_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "voice_call"
    }),
  });

  const data = await res.json();
  return {
    ok: res.ok,
    error: data.error?.message ?? null,
  };
}

export async function sendWhatsAppTemplate(
  workspaceId: string,
  phone: string,
  templateName: string,
  templateLanguage: string
) {
  const keys = await getMetaKeys(workspaceId);

  const res = await fetch(`${META_API}/${keys.meta_phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keys.meta_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
      },
    }),
  });

  const data = await res.json();
  return {
    ok: res.ok,
    wamid: data.messages?.[0]?.id ?? null,
    error: data.error?.message ?? null,
  };
}

export async function sendWhatsAppText(workspaceId: string, phone: string, message: string) {
  const keys = await getMetaKeys(workspaceId);

  const res = await fetch(`${META_API}/${keys.meta_phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keys.meta_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace("+", ""),
      type: "text",
      text: { body: message },
    }),
  });

  const data = await res.json();
  return {
    ok: res.ok,
    wamid: data.messages?.[0]?.id ?? null,
    error: data.error?.message ?? null,
  };
}

export async function getWhatsAppSipCredentials(workspaceId: string) {
  const keys = await getMetaKeys(workspaceId);
  const token = keys.meta_access_token;
  const phoneId = keys.meta_phone_number_id;

  // 1. Fetch display phone number details
  const numRes = await fetch(`${META_API}/${phoneId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!numRes.ok) {
    throw new Error(`Failed to fetch WhatsApp phone number details: ${await numRes.text()}`);
  }
  const numData = await numRes.json();
  const phoneNumber = numData.display_phone_number.replace(/\D/g, "");

  // 2. Fetch SIP settings
  const settingsRes = await fetch(`${META_API}/${phoneId}/settings?include_sip_credentials=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!settingsRes.ok) {
    throw new Error(`Failed to fetch WhatsApp SIP settings: ${await settingsRes.text()}`);
  }
  const settingsData = await settingsRes.json();

  let sipPassword = settingsData.calling?.sip?.servers?.[0]?.sip_user_password;

  // 3. If calling or SIP is disabled, enable them
  if (settingsData.calling?.status !== "ENABLED" || settingsData.calling?.sip?.status !== "ENABLED" || !sipPassword) {
    console.log("[Meta Service] Enabling WhatsApp calling and SIP settings...");
    const enableRes = await fetch(`${META_API}/${phoneId}/settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        calling: {
          status: "ENABLED",
          call_icon_visibility: "DEFAULT",
          callback_permission_status: "ENABLED"
        }
      })
    });
    if (!enableRes.ok) {
      console.warn("[Meta Service] Failed to enable calling settings:", await enableRes.text());
    }

    // Fetch credentials again after enabling
    const refetchRes = await fetch(`${META_API}/${phoneId}/settings?include_sip_credentials=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (refetchRes.ok) {
      const refetchData = await refetchRes.json();
      sipPassword = refetchData.calling?.sip?.servers?.[0]?.sip_user_password;
    }
  }

  if (!sipPassword) {
    throw new Error("WhatsApp SIP password is not set on Meta. Please configure SIP settings in your WhatsApp Manager or App Dashboard.");
  }

  return {
    phoneNumber,
    sipPassword,
  };
}

