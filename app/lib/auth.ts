import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export type UserRole = 'player' | 'trainer' | 'admin';

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
};

export type AuthSession = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

/**
 * Load users from JSON file
 */
function loadUsers(): StoredUser[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(content) as StoredUser[];
  } catch (error) {
    console.error('Failed to load users:', error);
    return [];
  }
}

/**
 * Save users to JSON file
 */
function saveUsers(users: StoredUser[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save users:', error);
    throw new Error('Failed to save user data');
  }
}

/**
 * Load sessions from JSON file
 */
function loadSessions(): AuthSession[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(SESSIONS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    return JSON.parse(content) as AuthSession[];
  } catch (error) {
    console.error('Failed to load sessions:', error);
    return [];
  }
}

/**
 * Save sessions to JSON file
 */
function saveSessions(sessions: AuthSession[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save sessions:', error);
    throw new Error('Failed to save session data');
  }
}

/**
 * Hash password using SHA-256
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Generate session token (UUID + random hex)
 */
export function generateToken(): string {
  return crypto.randomUUID() + '-' + crypto.randomBytes(16).toString('hex');
}

/**
 * Register a new user
 */
export function registerUser(
  email: string,
  name: string,
  password: string,
  role: UserRole = 'player',
): { user: Omit<StoredUser, 'passwordHash'>; token: string } | { error: string } {
  try {
    const users = loadUsers();

    // Check if email already exists
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { error: 'Email already registered' };
    }

    // Validate input
    if (!email || !name || !password) {
      return { error: 'Missing required fields' };
    }

    if (password.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }

    // Create new user
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newUser: StoredUser = {
      id: userId,
      email: email.toLowerCase(),
      name,
      role,
      passwordHash: hashPassword(password),
      createdAt: now,
    };

    users.push(newUser);
    saveUsers(users);

    // Create session token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const session: AuthSession = {
      token,
      userId,
      createdAt: now,
      expiresAt,
    };

    const sessions = loadSessions();
    sessions.push(session);
    saveSessions(sessions);

    // Return user without password hash
    const userWithoutHash: Omit<StoredUser, 'passwordHash'> = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };

    return { user: userWithoutHash, token };
  } catch (error) {
    console.error('Failed to register user:', error);
    return { error: 'Failed to register user' };
  }
}

/**
 * Login user
 */
export function loginUser(
  email: string,
  password: string,
): { user: Omit<StoredUser, 'passwordHash'>; token: string } | { error: string } {
  try {
    const users = loadUsers();

    // Find user by email (case-insensitive)
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return { error: 'Invalid email or password' };
    }

    // Verify password
    const passwordHash = hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      return { error: 'Invalid email or password' };
    }

    // Update last login time
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);

    // Create new session token
    const token = generateToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const session: AuthSession = {
      token,
      userId: user.id,
      createdAt: now,
      expiresAt,
    };

    const sessions = loadSessions();
    sessions.push(session);
    saveSessions(sessions);

    // Return user without password hash
    const userWithoutHash: Omit<StoredUser, 'passwordHash'> = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };

    return { user: userWithoutHash, token };
  } catch (error) {
    console.error('Failed to login user:', error);
    return { error: 'Failed to login' };
  }
}

/**
 * Validate session token
 * Returns user if valid, null if invalid or expired
 */
export function validateSession(token: string): { user: Omit<StoredUser, 'passwordHash'> } | null {
  try {
    let sessions = loadSessions();
    const users = loadUsers();
    const now = new Date();

    // Find session by token
    const session = sessions.find((s) => s.token === token);

    if (!session) {
      return null;
    }

    // Check if expired
    if (new Date(session.expiresAt) < now) {
      // Clean up expired session
      sessions = sessions.filter((s) => s.token !== token);
      saveSessions(sessions);
      return null;
    }

    // Find user
    const user = users.find((u) => u.id === session.userId);

    if (!user) {
      // Clean up orphaned session
      sessions = sessions.filter((s) => s.token !== token);
      saveSessions(sessions);
      return null;
    }

    // Clean expired sessions periodically (every validation)
    const beforeCount = sessions.length;
    sessions = sessions.filter((s) => new Date(s.expiresAt) >= now);
    if (beforeCount !== sessions.length) {
      saveSessions(sessions);
    }

    // Return user without password hash
    const userWithoutHash: Omit<StoredUser, 'passwordHash'> = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };

    return { user: userWithoutHash };
  } catch (error) {
    console.error('Failed to validate session:', error);
    return null;
  }
}

/**
 * Logout user (invalidate token)
 */
export function logoutSession(token: string): void {
  try {
    let sessions = loadSessions();
    sessions = sessions.filter((s) => s.token !== token);
    saveSessions(sessions);
  } catch (error) {
    console.error('Failed to logout session:', error);
  }
}

/**
 * List all users (admin only)
 */
export function listUsers(): Array<Omit<StoredUser, 'passwordHash'>> {
  try {
    const users = loadUsers();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));
  } catch (error) {
    console.error('Failed to list users:', error);
    return [];
  }
}

/**
 * Get user by ID
 */
export function getUserById(id: string): Omit<StoredUser, 'passwordHash'> | null {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.id === id);

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  } catch (error) {
    console.error('Failed to get user by ID:', error);
    return null;
  }
}

/**
 * Delete user by ID (admin operation)
 */
export function deleteUserById(id: string): { success: boolean; error?: string } {
  try {
    let users = loadUsers();
    const userExists = users.some((u) => u.id === id);

    if (!userExists) {
      return { success: false, error: 'User not found' };
    }

    users = users.filter((u) => u.id !== id);
    saveUsers(users);

    // Also clean up all sessions for this user
    let sessions = loadSessions();
    sessions = sessions.filter((s) => s.userId !== id);
    saveSessions(sessions);

    return { success: true };
  } catch (error) {
    console.error('Failed to delete user:', error);
    return { success: false, error: 'Failed to delete user' };
  }
}

/**
 * Update user role (admin operation)
 */
export function updateUserRole(
  userId: string,
  newRole: UserRole,
): { success: boolean; error?: string } {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.id === userId);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    user.role = newRole;
    saveUsers(users);

    return { success: true };
  } catch (error) {
    console.error('Failed to update user role:', error);
    return { success: false, error: 'Failed to update user role' };
  }
}

/**
 * Check if a user with given email exists
 */
export function userExists(email: string): boolean {
  try {
    const users = loadUsers();
    return users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  } catch (error) {
    return false;
  }
}

/**
 * Get user by email
 */
export function getUserByEmail(email: string): Omit<StoredUser, 'passwordHash'> | null {
  try {
    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  } catch (error) {
    console.error('Failed to get user by email:', error);
    return null;
  }
}
