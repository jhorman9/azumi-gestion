import { redirect } from "next/navigation";
import {
  getCurrentUser,
  type SessionUser,
  type UserRole,
} from "@/lib/auth/session";

export const permissions = [
  "dashboard:read",
  "users:manage",
  "closings:read",
  "closings:write",
  "finance:read",
  "finance:write",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions = {
  admin: new Set<Permission>(permissions),
  manager: new Set<Permission>([
    "dashboard:read",
    "closings:read",
    "closings:write",
    "finance:read",
    "finance:write",
  ]),
  menu_editor: new Set<Permission>(),
} as const;

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return rolePermissions[role].has(permission);
}

export function homePathForRole(role: UserRole): string {
  return role === "menu_editor" ? "/login?error=role-retired" : "/dashboard";
}

export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user.role, permission)) {
    redirect(homePathForRole(user.role));
  }

  return user;
}
