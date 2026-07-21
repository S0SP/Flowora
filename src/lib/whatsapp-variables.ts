/**
 * Extracts and maps custom variables from an object into WhatsApp template components.
 * @param customFields - An object containing custom fields (e.g., from contact.custom_fields).
 * @returns Array of components for WhatsApp API, or undefined if no fields.
 */
export function buildWhatsAppTemplateComponents(customFields: Record<string, any> | undefined | null): any[] | undefined {
  if (!customFields || typeof customFields !== 'object' || Object.keys(customFields).length === 0) {
    return undefined;
  }

  // To preserve a predictable mapping, we rely on the object's value iteration order.
  // This matches how lead-capture creates variables from the parsed rows.
  return [
    {
      type: "body",
      parameters: Object.values(customFields).map(val => ({
        type: "text",
        text: String(val)
      }))
    }
  ];
}
