import { SignJWT, jwtVerify } from 'jose';

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = '7d';

let _secret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  _secret = new TextEncoder().encode(secret);
  return _secret;
}

export interface JWTPayload {
  userId: string;
  tv?: number;
  iat?: number;
  exp?: number;
}

/** Sign a JWT with the user's ID and tokenVersion. Returns the encoded token string. */
export async function signToken(userId: string, tokenVersion: number = 0): Promise<string> {
  return new SignJWT({ userId, tv: tokenVersion })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecret());
}

/** Verify a JWT and return the payload. Returns null if invalid/expired. */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [JWT_ALGORITHM],
    });
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
