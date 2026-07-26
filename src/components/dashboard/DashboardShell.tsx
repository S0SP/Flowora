"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";
import { WorkspaceProvider, type WorkspaceContextValue } from "@/context/WorkspaceContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { useUIStore } from "@/lib/store/useUIStore";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";

import { usePathname } from "next/navigation";

interface Props {
  workspaceData: WorkspaceContextValue;
  children: React.ReactNode;
}

export function DashboardShell({ workspaceData, children }: Props) {
  const { isSidebarOpen, isDark, setDark } = useUIStore();
  const pathname = usePathname();

  // Custom dark mode hydration removed in favor of next-themes

  const isViewportPage =
    pathname === "/dashboard/inbox" ||
    pathname === "/dashboard/leads" ||
    pathname === "/dashboard/contacts" ||
    pathname === "/dashboard/broadcasts" ||
    pathname?.startsWith("/dashboard/settings") ||
    pathname?.startsWith("/dashboard/workflows") ||
    pathname?.startsWith("/dashboard/team") ||
    pathname?.startsWith("/dashboard/tickets") ||
    pathname?.startsWith("/dashboard/chatbot") ||
    pathname?.startsWith("/dashboard/voice-agent") ||
    pathname?.startsWith("/dashboard/analytics") ||
    pathname === "/dashboard/lead-capture";

  return (
    <WorkspaceProvider value={workspaceData}>
      <NotificationsProvider
        workspaceId={workspaceData.workspace.id}
        userId={workspaceData.profile.id}
      >
        <div className="relative flex h-screen w-full overflow-hidden bg-background text-foreground">
          {/* Headless presence heartbeat — reports online/away every 30s */}
          <PresenceHeartbeat />
          <Sidebar />
          <div
            className={cn(
              "flex flex-1 flex-col h-screen overflow-hidden transition-all duration-300",
              isSidebarOpen ? "pl-[240px]" : "pl-[64px]"
            )}
          >
            <Topbar />
            <main
              className={cn(
                "flex-1 relative min-h-0",
                isViewportPage
                  ? "overflow-hidden p-0 flex flex-col"
                  : "overflow-y-auto"
              )}
            >
              {children}
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </WorkspaceProvider>
  );
}

