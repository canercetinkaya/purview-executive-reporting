import type { ApplicationRole, AuthenticatedPrincipal } from './types.js';

export type Permission =
  | 'portal:read'
  | 'reports:export'
  | 'managed_service:write'
  | 'recommendations:write'
  | 'collection:trigger'
  | 'admin:read'
  | 'admin:write'
  | 'tenants:cross_customer';

const ROLE_PERMISSIONS: Record<ApplicationRole, ReadonlySet<Permission>> = {
  PlatformAdmin: new Set<Permission>([
    'portal:read',
    'reports:export',
    'managed_service:write',
    'recommendations:write',
    'collection:trigger',
    'admin:read',
    'admin:write',
    'tenants:cross_customer',
  ]),
  ServiceManager: new Set<Permission>([
    'portal:read',
    'reports:export',
    'managed_service:write',
    'recommendations:write',
    'collection:trigger',
    'admin:read',
    'tenants:cross_customer',
  ]),
  SecurityAnalyst: new Set<Permission>([
    'portal:read',
    'reports:export',
    'managed_service:write',
    'recommendations:write',
    'collection:trigger',
    'tenants:cross_customer',
  ]),
  ComplianceAnalyst: new Set<Permission>([
    'portal:read',
    'reports:export',
    'managed_service:write',
    'recommendations:write',
    'tenants:cross_customer',
  ]),
  CustomerAdministrator: new Set<Permission>([
    'portal:read',
    'reports:export',
    'recommendations:write',
    'admin:read',
  ]),
  CustomerExecutive: new Set<Permission>([
    'portal:read',
    'reports:export',
  ]),
  CustomerReader: new Set<Permission>([
    'portal:read',
  ]),
};

export const ALL_ROLES: ApplicationRole[] = [
  'PlatformAdmin',
  'ServiceManager',
  'SecurityAnalyst',
  'ComplianceAnalyst',
  'CustomerAdministrator',
  'CustomerExecutive',
  'CustomerReader',
];

export function hasPermission(role: ApplicationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function getRolePermissions(role: ApplicationRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export class AuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 403, code = 'FORBIDDEN') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function assertPermission(principal: AuthenticatedPrincipal, permission: Permission): void {
  if (!hasPermission(principal.role, permission)) {
    throw new AuthorizationError(
      `Role '${principal.role}' lacks required permission '${permission}'.`,
      403,
      'INSUFFICIENT_PERMISSION',
    );
  }
}

/**
 * Enforces strict multi-tenant / customer isolation server-side.
 * Customer-scoped roles can ONLY query or mutate their assigned customer IDs.
 */
export function assertCustomerAccess(principal: AuthenticatedPrincipal, customerId: string): void {
  if (hasPermission(principal.role, 'tenants:cross_customer')) {
    if (principal.assignedCustomerIds.length === 0 || principal.assignedCustomerIds.includes('*')) {
      return;
    }
    if (principal.assignedCustomerIds.includes(customerId)) {
      return;
    }
  }

  if (!principal.assignedCustomerIds.includes(customerId)) {
    throw new AuthorizationError(
      `Tenant isolation check failed: principal '${principal.userId}' is not authorized for customer '${customerId}'.`,
      403,
      'TENANT_ISOLATION_DENIED',
    );
  }
}
