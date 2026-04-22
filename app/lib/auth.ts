import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { GlobalRole, CoachLevel } from './permissions';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Re-export for convenience
export type { GlobalRole, CoachLevel };

export type UserStatus = 'active' | 'pending' | 'disabled';

export type CoachProfile = {
  level: CoachLevel;
  certifiedAt?: string;
};

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
  status?: UserStatus;
  createdBy?: string;
  coachProfile?: CoachProfile;
  founderAccess?: boolean;
};

export type PublicUser = Omit<StoredUser, 'passwordHash'>;

export type AuthSession = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

// ─── File I/O ──────────────────────────────────────────────────

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

function loadUsers(): StoredUser[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(USERS_FILE)) return [];
    const content = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(content) as StoredUser[];
  } catch (error) {
    console.error('Failed to load users:', error);
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save users:', error);
    throw new Error('Failed to save user data');
  }
}

function loadSessions(): AuthSession[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')) as AuthSession[];
  } catch (error) {
    console.error('Failed to load sessions:', error);
    return [];
  }
}

function saveSessions(sessions: AuthSession[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save sessions:', error);
    throw new Error('Failed to save session data');
  }
}

// ─── Utilities ─────────────────────────────────────────────────

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function generateToken(): string {
  return crypto.randomUUID() + '-' + crypto.randomBytes(16).toString('hex');
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: migrateRole(user.role),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    status: user.status,
    createdBy: user.createdBy,
    coachProfile: user.coachProfile,
    founderAccess: user.founderAccess,
  };
}

/**
 * Migrate legacy roles to new model.
 * 'player' | 'trainer' | 'admin' → 'user'
 * 'super_admin' → 'super_admin'
 */
export function migrateRole(role: string): GlobalRole {
  if (role === 'super_admin') return 'super_admin';
  return 'user';
}

// ─── Registration ──────────────────────────────────────────────

export function registerUser(
  email: string,
  name: string,
  password: string,
  role: GlobalRole = 'user',
): { user: PublicUser; token: string } | { error: string } {
  try {
    const users = loadUsers();

    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { error: 'Cette adresse email est déjà utilisée' };
    }

    if (!email || !name || !password) {
      return { error: 'Tous les champs sont requis' };
    }

    if (password.length < 8) {
      return { error: 'Le mot de passe doit contenir au moins 8 caractères' };
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newUser: StoredUser = {
      id: userId,
      email: email.toLowerCase(),
      name,
      role,
      passwordHash: hashPassword(password),
      createdAt: now,
      status: 'active',
    };

    users.push(newUser);
    saveUsers(users);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const sessions = loadSessions();
    sessions.push({ token, userId, createdAt: now, expiresAt });
    saveSessions(sessions);

    return { user: toPublicUser(newUser), token };
  } catch (error) {
    console.error('Failed to register user:', error);
    return { error: 'Failed to register user' };
  }
}

// ─── Login ─────────────────────────────────────────────────────

export function loginUser(
  email: string,
  password: string,
): { user: PublicUser; token: string } | { error: string } {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) return { error: 'Email ou mot de passe incorrect' };

    if (user.passwordHash !== hashPassword(password)) {
      return { error: 'Email ou mot de passe incorrect' };
    }

    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);

    const token = generateToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const sessions = loadSessions();
    sessions.push({ token, userId: user.id, createdAt: now, expiresAt });
    saveSessions(sessions);

    return { user: toPublicUser(user), token };
  } catch (error) {
    console.error('Failed to login user:', error);
    return { error: 'Failed to login' };
  }
}

// ─── Session Validation ────────────────────────────────────────

export function validateSession(token: string): { user: PublicUser } | null {
  try {
    let sessions = loadSessions();
    const users = loadUsers();
    const now = new Date();

    const session = sessions.find((s) => s.token === token);
    if (!session) return null;

    if (new Date(session.expiresAt) < now) {
      sessions = sessions.filter((s) => s.token !== token);
      saveSessions(sessions);
      return null;
    }

    const user = users.find((u) => u.id === session.userId);
    if (!user) {
      sessions = sessions.filter((s) => s.token !== token);
      saveSessions(sessions);
      return null;
    }

    // Periodic cleanup
    const beforeCount = sessions.length;
    sessions = sessions.filter((s) => new Date(s.expiresAt) >= now);
    if (beforeCount !== sessions.length) saveSessions(sessions);

    return { user: toPublicUser(user) };
  } catch (error) {
    console.error('Failed to validate session:', error);
    return null;
  }
}

// ─── Route Guard ──────────────────────────────────────────────
// Use in API routes: const auth = requireAuth(req); if (auth.error) return auth.error;

export function requireAuth(req: Request): { user: PublicUser; error?: never } | { user?: never; error: Response } {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return { error: Response.json({ error: 'Missing authorization token' }, { status: 401 }) };
  }
  const session = validateSession(token);
  if (!session) {
    return { error: Response.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  return { user: session.user };
}

// ─── Logout ────────────────────────────────────────────────────

export function logoutSession(token: string): void {
  try {
    let sessions = loadSessions();
    sessions = sessions.filter((s) => s.token !== token);
    saveSessions(sessions);
  } catch (error) {
    console.error('Failed to logout session:', error);
  }
}

// ─── User Queries ──────────────────────────────────────────────

export function listUsers(): PublicUser[] {
  try {
    return loadUsers().map(toPublicUser);
  } catch (error) {
    console.error('Failed to list users:', error);
    return [];
  }
}

export function getUserById(id: string): PublicUser | null {
  try {
    const user = loadUsers().find((u) => u.id === id);
    return user ? toPublicUser(user) : null;
  } catch (error) {
    console.error('Failed to get user by ID:', error);
    return null;
  }
}

export function getUserByEmail(email: string): PublicUser | null {
  try {
    const user = loadUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? toPublicUser(user) : null;
  } catch (error) {
    console.error('Failed to get user by email:', error);
    return null;
  }
}

export function userExists(email: string): boolean {
  try {
    return loadUsers().some((u) => u.email.toLowerCase() === email.toLowerCase());
  } catch {
    return false;
  }
}

// ─── User Management ───────────────────────────────────────────

export function createManagedUser(params: {
  email: string;
  name: string;
  createdBy: string;
  role?: GlobalRole;
  coachProfile?: CoachProfile;
}): { user: PublicUser; tempPassword: string } | { error: string } {
  const users = loadUsers();

  if (users.some((u) => u.email.toLowerCase() === params.email.toLowerCase())) {
    return { error: 'Email already registered' };
  }

  const tempPassword = crypto.randomBytes(4).toString('hex');
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newUser: StoredUser = {
    id: userId,
    email: params.email.toLowerCase(),
    name: params.name,
    role: params.role || 'user',
    passwordHash: hashPassword(tempPassword),
    createdAt: now,
    status: 'active',
    createdBy: params.createdBy,
    coachProfile: params.coachProfile,
  };

  users.push(newUser);
  saveUsers(users);

  return { user: toPublicUser(newUser), tempPassword };
}

export function deleteUserById(id: string): { success: boolean; error?: string } {
  try {
    let users = loadUsers();
    const target = users.find((u) => u.id === id);
    if (!target) return { success: false, error: 'User not found' };

    // Protect last super_admin
    if (migrateRole(target.role) === 'super_admin') {
      const superAdminCount = users.filter((u) => migrateRole(u.role) === 'super_admin').length;
      if (superAdminCount <= 1) {
        return { success: false, error: 'Impossible de supprimer le dernier super_admin' };
      }
    }

    users = users.filter((u) => u.id !== id);
    saveUsers(users);

    let sessions = loadSessions();
    sessions = sessions.filter((s) => s.userId !== id);
    saveSessions(sessions);

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to delete user' };
  }
}

export function updateUserRole(userId: string, newRole: GlobalRole): { success: boolean; error?: string } {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found' };

    // Protect last super_admin from demotion
    if (migrateRole(user.role) === 'super_admin' && newRole !== 'super_admin') {
      const superAdminCount = users.filter((u) => migrateRole(u.role) === 'super_admin').length;
      if (superAdminCount <= 1) {
        return { success: false, error: 'Impossible de rétrograder le dernier super_admin' };
      }
    }

    user.role = newRole;
    saveUsers(users);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update user role' };
  }
}

export function updateUserStatus(userId: string, status: UserStatus): { success: boolean; error?: string } {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found' };

    user.status = status;
    saveUsers(users);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update status' };
  }
}

export function updateFounderAccess(userId: string, founderAccess: boolean): { success: boolean; error?: string } {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found' };

    user.founderAccess = founderAccess;
    saveUsers(users);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update founder access' };
  }
}

export function updateUserPassword(userId: string, newPassword: string): { success: boolean; error?: string } {
  try {
    if (newPassword.length < 8) return { success: false, error: 'Le mot de passe doit contenir au moins 8 caractères' };

    const users = loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found' };

    user.passwordHash = hashPassword(newPassword);
    saveUsers(users);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update password' };
  }
}

/**
 * Update user's coach profile (level, certification date)
 */
export function updateCoachProfile(
  userId: string,
  coachProfile: CoachProfile,
): { success: boolean; error?: string } {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found' };

    user.coachProfile = coachProfile;
    saveUsers(users);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update coach profile' };
  }
}
