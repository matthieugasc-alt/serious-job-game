/**
 * permissions.ts — Centralized role & permission system
 *
 * Simplified model:
 *   - GlobalRole = 'user' | 'super_admin' (only 2 system roles)
 *   - Everything else via Organization + Membership
 *   - coachLevel is on the USER (coachProfile), not the org
 */

// ─── Global Roles ───────────────────────────────────────────────

export type GlobalRole = 'user' | 'super_admin';

// ─── Organization Context ──────────────────────────────────────

export type OrgMemberRole = 'admin' | 'member';
export type OrgType = 'enterprise' | 'coach';
export type CoachLevel = 'apprenti' | 'confirme';

// ─── Active Context ────────────────────────────────────────────
// Which "space" the user is currently operating in.
// Stored client-side and sent with API requests.

export type ActiveContext =
  | { type: 'personal' }
  | { type: 'organization'; organizationId: string };

// ─── Permission Actions ─────────────────────────────────────────

export type Permission =
  // System-wide (super_admin only)
  | 'system:manage_organizations'
  | 'system:manage_users'
  | 'system:view_all_results'
  | 'system:manage_feature_flags'
  // Organization (org admin)
  | 'org:view_members'
  | 'org:create_accounts'
  | 'org:disable_accounts'
  | 'org:assign_scenarios'
  | 'org:view_results'
  | 'org:manage_settings'
  // Coaching specific (coach confirmé)
  | 'coach:advanced_analytics'
  | 'coach:custom_scenarios';

// ─── Permission Matrix ──────────────────────────────────────────

/** Org admin always gets these */
const ORG_ADMIN_PERMISSIONS: Permission[] = [
  'org:view_members',
  'org:create_accounts',
  'org:disable_accounts',
  'org:assign_scenarios',
  'org:view_results',
  'org:manage_settings',
];

/** Additional permissions for confirmed coaches */
const COACH_CONFIRME_PERMISSIONS: Permission[] = [
  'coach:advanced_analytics',
  'coach:custom_scenarios',
];

// ─── Permission Check Functions ─────────────────────────────────

/**
 * Check if user can perform action.
 * super_admin can do everything.
 * For org-level checks, pass orgContext.
 */
export function canDo(
  globalRole: GlobalRole,
  permission: Permission,
  orgContext?: {
    memberRole: OrgMemberRole;
    orgType: OrgType;
    coachLevel?: CoachLevel; // from the user's coachProfile, NOT the org
  } | null,
): boolean {
  // Super admin can do everything
  if (globalRole === 'super_admin') return true;

  // System-level permissions are super_admin only
  if (permission.startsWith('system:')) return false;

  // Org context required for org-level permissions
  if (!orgContext) return false;

  if (orgContext.memberRole === 'admin') {
    if (ORG_ADMIN_PERMISSIONS.includes(permission)) return true;
    // Coach-specific extras for confirmed coaches
    if (orgContext.orgType === 'coach' && orgContext.coachLevel === 'confirme') {
      if (COACH_CONFIRME_PERMISSIONS.includes(permission)) return true;
    }
  }

  return false;
}

// ─── Helper: Determine user's effective capabilities ────────────

export type UserCapabilities = {
  isSuperAdmin: boolean;
  canManageOrgs: boolean;
  orgCapabilities: Array<{
    organizationId: string;
    orgType: OrgType;
    memberRole: OrgMemberRole;
    canManageMembers: boolean;
    canAssignScenarios: boolean;
    canViewResults: boolean;
    isCoachConfirme: boolean;
  }>;
};

/**
 * Build a full capability snapshot for a user.
 * Used by the frontend to show/hide UI elements.
 */
export function buildCapabilities(
  globalRole: GlobalRole,
  orgMemberships: Array<{
    organizationId: string;
    memberRole: OrgMemberRole;
    orgType: OrgType;
    coachLevel?: CoachLevel;
    status: string;
  }>,
): UserCapabilities {
  const activeMemberships = orgMemberships.filter((m) => m.status === 'active');

  return {
    isSuperAdmin: globalRole === 'super_admin',
    canManageOrgs: globalRole === 'super_admin',

    orgCapabilities: activeMemberships.map((m) => ({
      organizationId: m.organizationId,
      orgType: m.orgType,
      memberRole: m.memberRole,
      canManageMembers: canDo(globalRole, 'org:create_accounts', {
        memberRole: m.memberRole,
        orgType: m.orgType,
        coachLevel: m.coachLevel,
      }),
      canAssignScenarios: canDo(globalRole, 'org:assign_scenarios', {
        memberRole: m.memberRole,
        orgType: m.orgType,
        coachLevel: m.coachLevel,
      }),
      canViewResults: canDo(globalRole, 'org:view_results', {
        memberRole: m.memberRole,
        orgType: m.orgType,
        coachLevel: m.coachLevel,
      }),
      isCoachConfirme:
        m.orgType === 'coach' && m.coachLevel === 'confirme',
    })),
  };
}

// ─── Route Guard Helpers ────────────────────────────────────────

export function isSuperAdmin(role: GlobalRole | string): boolean {
  return role === 'super_admin';
}

/**
 * Check if a role string is admin-level (super_admin).
 * Also accepts legacy 'admin' for backward compat during migration.
 */
export function isAdminRole(role: GlobalRole | string): boolean {
  return role === 'super_admin' || role === 'admin';
}
