import type { Role } from '@washington/shared';

export const PERMISSIONS = {
  CREATE_TRAINING: 'training:create',
  VIEW_FINANCIAL: 'financeiro:view',
  MANAGE_REWARDS: 'rewards:manage',
  VIEW_ALL_UNITS: 'workspaces:view_all',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function canAccessWorkspace(
  userRole: Role,
  userWorkspaceId: string | null,
  targetWorkspaceId: string,
): boolean {
  if (userRole === 'franqueadora_admin') return true;
  return userWorkspaceId === targetWorkspaceId;
}

export function canManageUsers(role: Role): boolean {
  return role === 'franqueadora_admin' || role === 'franqueado_admin';
}

export function canCreateContent(role: Role, permissions: string[]): boolean {
  if (role === 'franqueadora_admin') return true;
  if (role === 'franqueado_admin') return true;
  return permissions.includes(PERMISSIONS.CREATE_TRAINING);
}
