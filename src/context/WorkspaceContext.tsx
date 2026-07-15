"use client";

import { createContext, useContext } from "react";

export interface WorkspaceProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  onboarding_completed: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  owner_id: string;
}

export interface WorkspaceMember {
  role: "owner" | "admin" | "manager" | "agent";
  credits_used: number;
  credit_limit: number | null;
}

export interface CreditWallet {
  balance: number;
  monthly_grant: number;
}

export interface WorkspaceContextValue {
  profile: WorkspaceProfile;
  workspace: Workspace;
  member: WorkspaceMember;
  credits: CreditWallet;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceContextValue;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return ctx;
}
