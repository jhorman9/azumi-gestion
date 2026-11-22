"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  ClipboardCheck,
  HandCoins,
  History,
  LayoutDashboard,
  ReceiptText,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";

const icons = {
  dashboard: LayoutDashboard,
  closings: ClipboardCheck,
  expenses: ReceiptText,
  suppliers: Truck,
  bills: WalletCards,
  reports: ChartNoAxesCombined,
  tips: HandCoins,
  users: Users,
  audit: History,
};

type SidebarLinkIcon = keyof typeof icons;

interface SidebarLinkProps {
  href: string;
  icon: SidebarLinkIcon;
  children: string;
}

export function SidebarLink({
  href,
  icon,
  children,
}: SidebarLinkProps) {
  const pathname = usePathname();
  const Icon = icons[icon];
  const active =
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`sidebar-link${active ? " sidebar-link-active" : ""}`}
      href={href}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{children}</span>
    </Link>
  );
}
