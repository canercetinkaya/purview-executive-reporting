import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  ALL_ROLES,
  AuthorizationError,
  assertCustomerAccess,
  assertPermission,
  type ApplicationRole,
  type AuthenticatedPrincipal,
  type Permission,
} from '@purview-portal/domain';
import type { AppEnv } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  principal?: AuthenticatedPrincipal;
}

export interface DemoPersona {
  id: string;
  displayName: string;
  email: string;
  role: ApplicationRole;
  assignedCustomerIds: string[];
  description: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'persona-service-manager',
    displayName: 'Alex Mercer (Service Manager)',
    email: 'alex.mercer@managed-secops.example',
    role: 'ServiceManager',
    assignedCustomerIds: [],
    description: 'Cross-customer Managed Purview service delivery lead',
  },
  {
    id: 'persona-platform-admin',
    displayName: 'Jordan Lee (Platform Admin)',
    email: 'jordan.lee@managed-secops.example',
    role: 'PlatformAdmin',
    assignedCustomerIds: [],
    description: 'Full platform configuration and connector admin',
  },
  {
    id: 'persona-security-analyst',
    displayName: 'Morgan Patel (Security Analyst)',
    email: 'morgan.patel@managed-secops.example',
    role: 'SecurityAnalyst',
    assignedCustomerIds: [],
    description: 'SOC / Purview DLP & Incident triage analyst',
  },
  {
    id: 'persona-contoso-exec',
    displayName: 'Elena Vance (Contoso CISO)',
    email: 'elena.vance@contoso-fin.example',
    role: 'CustomerExecutive',
    assignedCustomerIds: ['cust-contoso-fin'],
    description: 'Read + Export scoped strictly to Contoso Financial Group',
  },
  {
    id: 'persona-contoso-reader',
    displayName: 'Sam Rivera (Contoso Compliance Reader)',
    email: 'sam.rivera@contoso-fin.example',
    role: 'CustomerReader',
    assignedCustomerIds: ['cust-contoso-fin'],
    description: 'Read-only view scoped strictly to Contoso Financial Group',
  },
  {
    id: 'persona-northwind-admin',
    displayName: 'Taylor Kim (Northwind IT Admin)',
    email: 'taylor.kim@northwind-health.example',
    role: 'CustomerAdministrator',
    assignedCustomerIds: ['cust-northwind-health'],
    description: 'Scoped strictly to Northwind Health Systems',
  },
];

function parseRole(rawRole: unknown): ApplicationRole {
  if (typeof rawRole === 'string' && ALL_ROLES.includes(rawRole as ApplicationRole)) {
    return rawRole as ApplicationRole;
  }
  return 'CustomerReader';
}

export function createAuthMiddleware(env: AppEnv) {
  const jwks =
    env.AUTH_MODE === 'entra' && env.ENTRA_TENANT_ID
      ? createRemoteJWKSet(
          new URL(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/discovery/v2.0/keys`),
        )
      : null;

  return async function authenticate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (env.AUTH_MODE === 'entra') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Entra ID Bearer token.' });
        return;
      }
      if (!jwks || !env.ENTRA_TENANT_ID || !env.ENTRA_API_AUDIENCE) {
        res.status(500).json({ error: 'AUTH_MISCONFIGURED', message: 'Entra OIDC configuration is incomplete.' });
        return;
      }
      try {
        const token = authHeader.slice('Bearer '.length).trim();
        const { payload } = await jwtVerify(token, jwks, {
          issuer: `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0`,
          audience: env.ENTRA_API_AUDIENCE,
        });
        const roles = Array.isArray(payload.roles) ? payload.roles : [];
        const customerClaims = Array.isArray(payload.customer_ids)
          ? payload.customer_ids.filter((c): c is string => typeof c === 'string')
          : [];

        req.principal = {
          userId: String(payload.oid ?? payload.sub ?? 'entra-user'),
          displayName: String(payload.name ?? payload.preferred_username ?? 'Entra User'),
          email: String(payload.preferred_username ?? payload.upn ?? 'unknown@entra.example'),
          role: parseRole(roles[0]),
          assignedCustomerIds: customerClaims,
          authMethod: 'entra',
        };
        next();
        return;
      } catch {
        res.status(401).json({ error: 'INVALID_TOKEN', message: 'Entra ID token validation failed.' });
        return;
      }
    }

    // AUTH_MODE === 'demo': resolves explicit persona header or defaults to ServiceManager in demo mode
    const personaId = req.header('x-demo-persona');
    if (personaId) {
      const persona = DEMO_PERSONAS.find((p) => p.id === personaId);
      if (!persona) {
        res.status(401).json({ error: 'INVALID_DEMO_PERSONA', message: 'Unknown demo persona.' });
        return;
      }
      req.principal = {
        userId: persona.id,
        displayName: persona.displayName,
        email: persona.email,
        role: persona.role,
        assignedCustomerIds: persona.assignedCustomerIds,
        authMethod: 'demo',
      };
      next();
      return;
    }

    // Explicit role/customer headers for automated RBAC/IDOR testing
    const explicitRole = req.header('x-demo-role');
    if (explicitRole) {
      const role = ALL_ROLES.includes(explicitRole as ApplicationRole)
        ? (explicitRole as ApplicationRole)
        : null;
      if (!role) {
        res.status(401).json({ error: 'INVALID_ROLE', message: 'Unsupported role header.' });
        return;
      }
      const rawCustomers = req.header('x-demo-customers') ?? '';
      const assignedCustomerIds = rawCustomers
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      req.principal = {
        userId: `demo-${role.toLowerCase()}`,
        displayName: `Demo ${role}`,
        email: `${role.toLowerCase()}@demo.local`,
        role,
        assignedCustomerIds,
        authMethod: 'demo',
      };
      next();
      return;
    }

    const defaultPersona = DEMO_PERSONAS[0]!;
    req.principal = {
      userId: defaultPersona.id,
      displayName: defaultPersona.displayName,
      email: defaultPersona.email,
      role: defaultPersona.role,
      assignedCustomerIds: defaultPersona.assignedCustomerIds,
      authMethod: 'demo',
    };
    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.principal) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
      return;
    }
    try {
      assertPermission(req.principal, permission);
      next();
    } catch (err) {
      if (err instanceof AuthorizationError) {
        res.status(err.statusCode).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  };
}

export function requireCustomerScope(paramName = 'customerId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.principal) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
      return;
    }
    const rawParam = req.params[paramName];
    const customerId = Array.isArray(rawParam) ? rawParam[0] : rawParam;
    if (!customerId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: `Missing '${paramName}' parameter.` });
      return;
    }
    try {
      assertCustomerAccess(req.principal, customerId);
      next();
    } catch (err) {
      if (err instanceof AuthorizationError) {
        res.status(err.statusCode).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  };
}
