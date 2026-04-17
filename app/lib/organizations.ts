/**
 * organizations.ts — CRUD for Organizations and Memberships
 *
 * File-based persistence. An Organization can be an enterprise or a coach practice.
 * Memberships link users to organizations with a role.
 * NOTE: coachLevel lives on the USER (coachProfile), not on the org.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { OrgType, OrgMemberRole } from './permissions';

const DATA_DIR = path.join(process.cwd(), 'data');
const ORGS_FILE = path.join(DATA_DIR, 'organizations.json');
const MEMBERSHIPS_FILE = path.join(DATA_DIR, 'memberships.json');
const FEATURE_FLAGS_FILE = path.join(DATA_DIR, 'feature_flags.json');

// ─── Types ──────────────────────────────────────────────────────

export type Organization = {
  id: string;
  name: string;
  type: OrgType;
  adminUserId: string;
  createdAt: string;
  status: 'active' | 'suspended';
  settings: {
    description?: string;
    logoUrl?: string;
  };
};

export type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgMemberRole;
  joinedAt: string;
  status: 'active' | 'pending' | 'disabled';
  invitedBy?: string;
};

export type FeatureFlags = {
  organizationId: string;
  features: {
    custom_scenarios: boolean;
    studio_access: boolean;
    max_managed_users: number;
    advanced_analytics: boolean;
  };
};

// ─── File I/O ───────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON<T>(filepath: string, fallback: T[]): T[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJSON<T>(filepath: string, data: T[]): void {
  ensureDataDir();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadOrgs(): Organization[] { return loadJSON<Organization>(ORGS_FILE, []); }
function saveOrgs(orgs: Organization[]): void { saveJSON(ORGS_FILE, orgs); }
function loadMemberships(): Membership[] { return loadJSON<Membership>(MEMBERSHIPS_FILE, []); }
function saveMemberships(m: Membership[]): void { saveJSON(MEMBERSHIPS_FILE, m); }
function loadFeatureFlags(): FeatureFlags[] { return loadJSON<FeatureFlags>(FEATURE_FLAGS_FILE, []); }
function saveFeatureFlags(f: FeatureFlags[]): void { saveJSON(FEATURE_FLAGS_FILE, f); }

// ─── Organization CRUD ──────────────────────────────────────────

export function createOrganization(params: {
  name: string;
  type: OrgType;
  adminUserId: string;
  description?: string;
}): { org: Organization } | { error: string } {
  const orgs = loadOrgs();

  if (orgs.some((o) => o.name.toLowerCase() === params.name.toLowerCase())) {
    return { error: 'Organization name already exists' };
  }

  const org: Organization = {
    id: crypto.randomUUID(),
    name: params.name,
    type: params.type,
    adminUserId: params.adminUserId,
    createdAt: new Date().toISOString(),
    status: 'active',
    settings: {
      description: params.description,
    },
  };

  orgs.push(org);
  saveOrgs(orgs);

  // Auto-create admin membership
  const memberships = loadMemberships();
  memberships.push({
    id: crypto.randomUUID(),
    userId: params.adminUserId,
    organizationId: org.id,
    role: 'admin',
    joinedAt: org.createdAt,
    status: 'active',
  });
  saveMemberships(memberships);

  // Create default feature flags
  const flags = loadFeatureFlags();
  flags.push({
    organizationId: org.id,
    features: {
      custom_scenarios: false,
      studio_access: false,
      max_managed_users: params.type === 'enterprise' ? 50 : 20,
      advanced_analytics: false,
    },
  });
  saveFeatureFlags(flags);

  return { org };
}

export function getOrganization(orgId: string): Organization | null {
  return loadOrgs().find((o) => o.id === orgId) || null;
}

export function listOrganizations(filter?: { type?: OrgType; status?: string }): Organization[] {
  let orgs = loadOrgs();
  if (filter?.type) orgs = orgs.filter((o) => o.type === filter.type);
  if (filter?.status) orgs = orgs.filter((o) => o.status === filter.status);
  return orgs;
}

export function updateOrganization(
  orgId: string,
  updates: Partial<Pick<Organization, 'name' | 'status' | 'settings'>>,
): { org: Organization } | { error: string } {
  const orgs = loadOrgs();
  const idx = orgs.findIndex((o) => o.id === orgId);
  if (idx === -1) return { error: 'Organization not found' };

  if (updates.name) orgs[idx].name = updates.name;
  if (updates.status) orgs[idx].status = updates.status;
  if (updates.settings) orgs[idx].settings = { ...orgs[idx].settings, ...updates.settings };

  saveOrgs(orgs);
  return { org: orgs[idx] };
}

// ─── Membership CRUD ────────────────────────────────────────────

export function addMember(params: {
  userId: string;
  organizationId: string;
  role?: OrgMemberRole;
  invitedBy?: string;
}): { membership: Membership } | { error: string } {
  const memberships = loadMemberships();

  const existing = memberships.find(
    (m) => m.userId === params.userId && m.organizationId === params.organizationId,
  );
  if (existing) {
    if (existing.status === 'disabled') {
      existing.status = 'active';
      saveMemberships(memberships);
      return { membership: existing };
    }
    return { error: 'User is already a member of this organization' };
  }

  // Check max_managed_users
  const flags = getFeatureFlags(params.organizationId);
  const currentCount = memberships.filter(
    (m) => m.organizationId === params.organizationId && m.status !== 'disabled',
  ).length;
  if (flags && currentCount >= flags.features.max_managed_users) {
    return { error: `Maximum managed users reached (${flags.features.max_managed_users})` };
  }

  const membership: Membership = {
    id: crypto.randomUUID(),
    userId: params.userId,
    organizationId: params.organizationId,
    role: params.role || 'member',
    joinedAt: new Date().toISOString(),
    status: 'active',
    invitedBy: params.invitedBy,
  };

  memberships.push(membership);
  saveMemberships(memberships);
  return { membership };
}

export function removeMember(userId: string, organizationId: string): { success: boolean; error?: string } {
  const memberships = loadMemberships();
  const idx = memberships.findIndex(
    (m) => m.userId === userId && m.organizationId === organizationId,
  );
  if (idx === -1) return { success: false, error: 'Membership not found' };

  memberships[idx].status = 'disabled';
  saveMemberships(memberships);
  return { success: true };
}

export function getOrgMembers(organizationId: string): Membership[] {
  return loadMemberships().filter(
    (m) => m.organizationId === organizationId && m.status !== 'disabled',
  );
}

export function getUserMemberships(userId: string): Array<Membership & { org: Organization }> {
  const memberships = loadMemberships().filter(
    (m) => m.userId === userId && m.status === 'active',
  );
  const orgs = loadOrgs();

  return memberships
    .map((m) => {
      const org = orgs.find((o) => o.id === m.organizationId);
      return org ? { ...m, org } : null;
    })
    .filter(Boolean) as Array<Membership & { org: Organization }>;
}

export function getMembership(userId: string, organizationId: string): Membership | null {
  return (
    loadMemberships().find(
      (m) => m.userId === userId && m.organizationId === organizationId && m.status !== 'disabled',
    ) || null
  );
}

// ─── Feature Flags ──────────────────────────────────────────────

export function getFeatureFlags(organizationId: string): FeatureFlags | null {
  return loadFeatureFlags().find((f) => f.organizationId === organizationId) || null;
}

export function updateFeatureFlags(
  organizationId: string,
  updates: Partial<FeatureFlags['features']>,
): { success: boolean } {
  const flags = loadFeatureFlags();
  const idx = flags.findIndex((f) => f.organizationId === organizationId);
  if (idx === -1) return { success: false };

  flags[idx].features = { ...flags[idx].features, ...updates };
  saveFeatureFlags(flags);
  return { success: true };
}

// ─── Convenience Queries ────────────────────────────────────────

export function getAdministeredOrgs(userId: string): Organization[] {
  const memberships = loadMemberships().filter(
    (m) => m.userId === userId && m.role === 'admin' && m.status === 'active',
  );
  const orgs = loadOrgs();
  return memberships
    .map((m) => orgs.find((o) => o.id === m.organizationId))
    .filter(Boolean) as Organization[];
}

export function countActiveMembers(organizationId: string): number {
  return loadMemberships().filter(
    (m) => m.organizationId === organizationId && m.status === 'active',
  ).length;
}
