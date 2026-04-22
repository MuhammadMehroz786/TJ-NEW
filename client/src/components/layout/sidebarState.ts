import { createContext, useContext } from "react";

/**
 * Shared sidebar state for AppLayout + Sidebar + TopBar.
 *
 * - `collapsed` (desktop only): icon-only rail vs full width. Persists to
 *   localStorage so a merchant's choice survives reloads.
 * - `mobileOpen`: whether the slide-over drawer is visible below the lg
 *   breakpoint. Always starts false on each page load; the hamburger in
 *   TopBar toggles it.
 */
export interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

export const SidebarCtx = createContext<SidebarState | null>(null);

export function useSidebarState(): SidebarState {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error("useSidebarState must be used inside AppLayout");
  return ctx;
}

export const SIDEBAR_COLLAPSED_KEY = "tijarflow_sidebar_collapsed";
