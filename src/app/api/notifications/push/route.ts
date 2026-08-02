import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sendPushToUser } from '@/lib/fcm-send';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

/* ------------------------------------------------------------------ */
/*  POST /api/notifications/push                                      */
/*  Send an FCM push to a recipient's registered devices (Step 3.2).  */
/*                                                                    */
/*  Triggered by the client (chat-service) only when the recipient is */
/*  NOT actively connected, so they still get notified about a new    */
/*  message without an open Firestore connection.                     */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    recipientId?: unknown;
    conversationId?: unknown;
    senderId?: unknown;
    senderName?: unknown;
    preview?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { recipientId, conversationId, senderId, senderName, preview } = body;

  // The push must always be sent as the authenticated user, to the other
  // participant of a real conversation. Reject anything else — this prevents
  // a caller from spamming arbitrary users via this endpoint.
  if (
    typeof recipientId !== 'string' ||
    !recipientId ||
    typeof conversationId !== 'string' ||
    !conversationId ||
    typeof senderId !== 'string' ||
    senderId !== user.id ||
    recipientId === senderId
  ) {
    return NextResponse.json({ error: 'Invalid push payload' }, { status: 400 });
  }

  // Anti-spam: verify the conversation exists and both parties are its
  // participants before sending anything.
  const app = await getFirebaseAdminApp();
  if (!app) {
    return NextResponse.json({ error: 'Push unavailable' }, { status: 503 });
  }
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const snap = await getFirestore(app).doc(`conversations/${conversationId}`).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    const participants: string[] = snap.data()?.participants ?? [];
    if (
      participants.length !== 2 ||
      !participants.includes(senderId) ||
      !participants.includes(recipientId)
    ) {
      return NextResponse.json({ error: 'Not a conversation participant' }, { status: 403 });
    }
  } catch (err) {
    console.error('[Push] conversation check failed:', err);
    return NextResponse.json({ error: 'Failed to verify conversation' }, { status: 500 });
  }

  try {
    // Cap lengths server-side — this endpoint is independently callable, so
    // never trust the client to keep the push body small.
    const name = typeof senderName === 'string' && senderName ? String(senderName).slice(0, 60) : 'Someone';
    const msgPreview = typeof preview === 'string' && preview ? String(preview).slice(0, 120) : 'New message';

    const attempted = await sendPushToUser(recipientId, {
      title: name,
      body: msgPreview,
      data: {
        conversationId,
        senderId,
        senderName: name,
        type: 'new_message',
      },
    });
    return NextResponse.json({ success: true, attempted });
  } catch (err) {
    console.error('[Push] sendPushToUser failed:', err);
    return NextResponse.json({ error: 'Failed to send push' }, { status: 500 });
  }
}
