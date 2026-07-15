import { create } from "zustand"
import { persist } from "zustand/middleware"

interface InboxState {
  selectedThreadId: string | null
  setSelectedThreadId: (id: string | null) => void
  drafts: Record<string, string>
  setDraft: (threadId: string, content: string) => void
  clearDraft: (threadId: string) => void
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set) => ({
      selectedThreadId: null,
      setSelectedThreadId: (id) => set({ selectedThreadId: id }),
      drafts: {},
      setDraft: (threadId, content) => set((state) => ({ drafts: { ...state.drafts, [threadId]: content } })),
      clearDraft: (threadId) => set((state) => {
        const { [threadId]: _, ...rest } = state.drafts
        return { drafts: rest }
      })
    }),
    {
      name: "flowora-inbox-storage"
    }
  )
)
