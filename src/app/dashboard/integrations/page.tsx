import { redirect } from "next/navigation"

// Integrations page removed — redirect to dashboard
export default function IntegrationsPage() {
  redirect("/dashboard")
}
