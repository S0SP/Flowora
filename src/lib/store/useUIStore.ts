import { create } from "zustand"

function getInitialDark(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem("flowra_dark_mode")
    if (stored !== null) return stored === "true"
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  } catch {
    return false
  }
}

interface UIState {
  isSidebarOpen: boolean
  isDark: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleDark: () => void
  setDark: (dark: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  isDark: false, // will be hydrated by DashboardShell on mount
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleDark: () =>
    set((state) => {
      const next = !state.isDark
      try { localStorage.setItem("flowra_dark_mode", String(next)) } catch {}
      return { isDark: next }
    }),
  setDark: (dark) => {
    try { localStorage.setItem("flowra_dark_mode", String(dark)) } catch {}
    set({ isDark: dark })
  },
}))
