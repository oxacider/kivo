import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import { generateToken, errorResponse } from '@/lib/auth';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';
import { ensureFirestoreUserMapping } from '@/lib/firestore-admin';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const { email, password, displayName, username } = await request.json();
    const authHeader = request.headers.get('authorization');

    let userEmail = email;
    let hashedPassword: string | null = null;
    let isFirebase = false;

    // Firebase path (primary): verify the ID token — the email is authoritative
    let firebaseUid: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const fb = await verifyFirebaseIdToken(authHeader.slice(7));
      if (fb?.email) {
        isFirebase = true;
        userEmail = fb.email;
        firebaseUid = fb.uid;
      }
    }

    if (!userEmail || !displayName || !username) {
      return errorResponse('All fields are required');
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return errorResponse('Username must be 3-30 characters, lowercase letters, numbers, and underscores only');
    }

    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email: { equals: userEmail, mode: 'insensitive' } },
          { username },
        ],
      },
    });
    if (existing) {
      return errorResponse(existing.email.toLowerCase() === userEmail.toLowerCase() ? 'Email already taken' : 'Username already taken', 409);
    }

    if (isFirebase) {
      // Password is managed by Firebase Auth; store a sentinel so the NOT NULL column is satisfied.
      hashedPassword = '!firebase!';
    } else {
      // Legacy path (kept intact — no legacy code deleted)
      if (!password) return errorResponse('All fields are required');
      if (password.length < 6) return errorResponse('Password must be at least 6 characters');
      hashedPassword = await hash(password, 12);
    }

    const verificationCode = generateCode();
    const user = await db.user.create({
      data: { email: userEmail, password: hashedPassword, displayName, username, verificationCode },
    });

    // Phase 2: write users/{firebaseUid} → { kivoId } so Firestore rules can
    // resolve the participant mapping for the freshly created account.
    if (firebaseUid) {
      await ensureFirestoreUserMapping(firebaseUid, user.id);
    }

    // Legacy JWT is only issued for the legacy path — Firebase clients use their ID token
    const token = isFirebase ? null : await generateToken(user.id);
    const { password: _, verificationCode: __, ...safeUser } = user;

    // In development, return the verification code
    const isDev = process.env.NODE_ENV !== 'production';

    return Response.json({
      success: true,
      data: {
        user: safeUser,
        token,
        verificationCode: isDev ? verificationCode : undefined,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Register error:', err);
    return errorResponse('Registration failed', 500);
  }
}
