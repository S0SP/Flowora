import { createAdminClient } from "@/lib/supabase/server";

const META_API = "https://graph.facebook.com/v19.0";

async function getMetaKeys() {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("app_settings").select("meta_access_token, meta_phone_number_id").single();
  if (!data?.meta_access_token || !data?.meta_phone_number_id) {
    throw new Error("Meta API keys are missing in Settings (BYOK)");
  }
  return data;
}

export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  templateLanguage: string
) {
  const keys = await getMetaKeys();

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

export async function sendWhatsAppText(phone: string, message: string) {
  const keys = await getMetaKeys();

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
