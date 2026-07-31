import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

/* ------------------------------------------------------------------ */
/*  POST /api/notifications/token                                     */
/*  Save (upsert) an FCM token for the authenticated user.            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { token?: string; device?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, device = 'web' } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    // Upsert: create or update (keep existing if already saved)
    await db.fCMToken.upsert({
      where: { userId_token: { userId: user.id, token } },
      update: { device },
      create: { userId: user.id, token, device },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[FCM] POST /notifications/token error:', err);
    return NextResponse.json({ error: 'Failed to save token' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/notifications/token                                   */
/*  Remove an FCM token for the authenticated user.                   */
/* ------------------------------------------------------------------ */

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    await db.fCMToken.deleteMany({
      where: { userId: user.id, token },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[FCM] DELETE /notifications/token error:', err);
    return NextResponse.json({ error: 'Failed to remove token' }, { status: 500 });
  }
}
