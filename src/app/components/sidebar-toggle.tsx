"use client";

import { useEffect, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const sidebarPreferenceKey = "azumi-sidebar-collapsed";
const sidebarPreferenceEvent = "azumi-sidebar-preference-change";

function subscribeToSidebarPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(sidebarPreferenceEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(sidebarPreferenceEvent, onChange);
  };
}

function getSidebarPreference() {
  return window.localStorage.getItem(sidebarPreferenceKey) === "true";
}

function getServerSidebarPreference() {
  return false;
}

export function SidebarToggle() {
  const isCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    getSidebarPreference,
    getServerSidebarPreference,
  );

  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = String(isCollapsed);
  }, [isCollapsed]);

  function toggleSidebar() {
    const nextCollapsed = !isCollapsed;
    window.localStorage.setItem(
      sidebarPreferenceKey,
      String(nextCollapsed),
    );
    document.documentElement.dataset.sidebarCollapsed =
      String(nextCollapsed);
    window.dispatchEvent(new Event(sidebarPreferenceEvent));
  }

  const label = isCollapsed ? "Mostrar menú lateral" : "Ocultar menú lateral";
  const Icon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <button
      aria-controls="manager-sidebar"
      aria-expanded={!isCollapsed}
      aria-label={label}
      className="sidebar-toggle"
      onClick={toggleSidebar}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
    </button>
  );
}
