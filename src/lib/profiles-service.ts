import { db } from '@/lib/db';

/* ------------------------------------------------------------------ */
/*  Profile types                                                     */
/* ------------------------------------------------------------------ */

/** Public-facing profile (safe for any authenticated viewer). */
export interface PublicProfile {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  bio: string;
  status: string;
  online: boolean;
  lastSeen: string;
  createdAt: string;
}

/** Fields the profile owner is allowed to update in ProfilePage / Settings. */
export interface ProfileUpdateInput {
  displayName?: string;
  bio?: string;
  status?: string;
  avatar?: string;
  theme?: string;
  username?: string;
}

/** Privacy-toggle fields exposed in SettingsPanel. */
export interface PrivacyInput {
  showOnline?: boolean;
  showLastSeen?: boolean;
  showReadReceipts?: boolean;
}

export interface PrivacyOutput {
  id: string;
  showOnline: boolean;
  showLastSeen: boolean;
  showReadReceipts: boolean;
}

/* ------------------------------------------------------------------ */
/*  Prisma row → PublicProfile mapper                                 */
/* ------------------------------------------------------------------ */

/**
 * Raw shape returned by Prisma when selecting the public profile columns.
 * lastSeen / createdAt are `Date` at the Prisma layer; we convert to ISO strings.
 */
interface PrismaProfileRow {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
  bio: string;
  status: string;
  online: boolean;
  lastSeen: Date;
  createdAt: Date;
}

function mapPublic(row: PrismaProfileRow): PublicProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    username: row.username,
    avatar: row.avatar,
    bio: row.bio,
    status: row.status,
    online: row.online,
    lastSeen: row.lastSeen.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const PUBLIC_SELECT = {
  id: true,
  displayName: true,
  username: true,
  avatar: true,
  bio: true,
  status: true,
  online: true,
  lastSeen: true,
  createdAt: true,
} as const;

/* ------------------------------------------------------------------ */
/*  Service operations                                                */
/* ------------------------------------------------------------------ */

/**
 * Fetch a public profile by user id.
 * Returns `null` when the user does not exist.
 */
export async function getProfile(userId: string): Promise<PublicProfile | null> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: PUBLIC_SELECT,
  });
  return row ? mapPublic(row as PrismaProfileRow) : null;
}

/**
 * Update the authenticated user's own profile.
 *
 * Validates:
 * - Only allowed fields are updated
 * - Username format (3-30 chars, lowercase alphanumeric + underscore) → 400
 * - Username uniqueness → 409
 *
 * Returns the full user object (without password hash).
 */
export async function updateProfile(
  userId: string,
  input: ProfileUpdateInput,
): Promise<Record<string, unknown>> {
  const allowed: (keyof ProfileUpdateInput)[] = [
    'displayName',
    'bio',
    'status',
    'avatar',
    'theme',
    'username',
  ];

  const data: Record<string, string> = {};
  for (const key of allowed) {
    const value = input[key];
    if (value !== undefined) data[key] = value;
  }

  if (data.username) {
    if (!/^[a-z0-9_]{3,30}$/.test(data.username)) {
      throw new ProfileValidationError(
        'Username must be 3-30 characters, lowercase letters, numbers, and underscores only',
      );
    }
    const existing = await db.user.findFirst({
      where: { username: data.username, NOT: { id: userId } },
    });
    if (existing) {
      throw new ProfileConflictError('Username already taken');
    }
  }

  const user = await db.user.update({ where: { id: userId }, data });
  const { password: _, ...safeUser } = user;
  return safeUser;
}

/**
 * Store an avatar data-URL for the authenticated user.
 * Returns the stored data-URL string.
 */
export async function storeAvatar(userId: string, dataUrl: string): Promise<string> {
  await db.user.update({
    where: { id: userId },
    data: { avatar: dataUrl },
  });
  return dataUrl;
}

/**
 * Update privacy toggles for the authenticated user.
 */
export async function updatePrivacySettings(
  userId: string,
  input: PrivacyInput,
): Promise<PrivacyOutput> {
  const data: Record<string, boolean> = {};
  const allowed: (keyof PrivacyInput)[] = ['showOnline', 'showLastSeen', 'showReadReceipts'];
  for (const key of allowed) {
    if (typeof input[key] === 'boolean') data[key] = input[key];
  }

  return db.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      showOnline: true,
      showLastSeen: true,
      showReadReceipts: true,
    },
  });
}

/**
 * Search public profiles by displayName or username (case-insensitive contains).
 * Excludes the searcher's own profile.  Capped at 20 results.
 */
export async function searchProfiles(
  query: string,
  excludeUserId: string,
): Promise<PublicProfile[]> {
  const rows = await db.user.findMany({
    where: {
      AND: [
        { id: { not: excludeUserId } },
        {
          OR: [
            { displayName: { contains: query } },
            { username: { contains: query } },
          ],
        },
      ],
    },
    select: PUBLIC_SELECT,
    take: 20,
  });
  return rows.map((r) => mapPublic(r as PrismaProfileRow));
}

/* ------------------------------------------------------------------ */
/*  Error classes                                                     */
/* ------------------------------------------------------------------ */

/** General validation error (client mistake → 400). */
export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

/** Conflict error (duplicate username → 409). */
export class ProfileConflictError extends ProfileValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileConflictError';
  }
}
