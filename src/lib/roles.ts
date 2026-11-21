// Client-safe role and scope definitions (no server-only imports).
export type Role = "owner" | "admin" | "responder" | "viewer";
export const ROLE_RANK: Record<Role, number> = { viewer: 0, responder: 1, admin: 2, owner: 3 };
export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Everything, including deleting the workspace" },
  { value: "admin", label: "Admin", description: "Manage monitors, pages, integrations and members" },
  { value: "responder", label: "Incident Responder", description: "Acknowledge, update and resolve incidents" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];
export const can = (role: string, min: Role) => (ROLE_RANK[role as Role] ?? -1) >= ROLE_RANK[min];

export const API_SCOPES = [
  { value: "read", label: "Read monitors, incidents & pages" },
  { value: "write", label: "Create / update / delete resources" },
  { value: "deployments", label: "Post deployment markers" },
] as const;
