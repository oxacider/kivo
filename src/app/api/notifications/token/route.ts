import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { registerToken, removeToken } from '@/lib/notification-service';

/* ------------------------------------------------------------------ */
/*  POST /api/notifications/token                                     */
/*  Register (upsert) a device push token for the authenticated user.  */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, platform = 'web' } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }
  if (!['web', 'android', 'ios'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  try {
    await registerToken(user.id, token, platform);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DeviceToken] POST /notifications/token error:', err);
    return NextResponse.json({ error: 'Failed to save token' }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/notifications/token                                   */
/*  Remove a specific device token.                                    */
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
    await removeToken(user.id, token);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DeviceToken] DELETE /notifications/token error:', err);
    return NextResponse.json({ error: 'Failed to remove token' }, { status: 500 });
  }
}
