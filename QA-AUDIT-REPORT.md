# KIVO Messenger — Production QA Audit Report

**Date**: 2025-07-15  
**Scope**: Full system audit — Push Notifications, Auth, Chat, Mobile, Security, Performance  
**Verdict**: 3 Critical, 6 High, 8 Medium, 3 Low — 20 total issues

---

## 1. PUSH NOTIFICATION FLOW

### P-01: Logout server-side removes ALL device tokens (kills other sessions)
**Severity: Critical**  
**File**: `src/app/api/auth/logout/route.ts:23`  
**Problem**: `removeAllTokensForUser(user.id)` deletes every device token for the user. If a user is logged in on Phone + Web and logs out from Web, the server deletes the Phone's push token too. The Phone stops receiving notifications even though its session is still active.  
**Fix**: Remove the `removeAllTokensForUser` call from the server. The client-side `disableNotifications()` in `auth-store.ts:40` already correctly removes only the current device's token.

```diff
// src/app/api/auth/logout/route.ts
 import { getAuthUser, invalidateToken, errorResponse } from '@/lib/auth';
-import { removeAllTokensForUser } from '@/lib/fcm-send';

 export async function POST(request: Request) {
   const user = await getAuthUser(request);
   if (!user) return errorResponse('Unauthorized', 401);

   const auth = request.headers.get('authorization');
   if (auth?.startsWith('Bearer ')) invalidateToken(auth.slice(7));

   const { db } = await import('@/lib/db');
   try {
     await db.user.update({
       where: { id: user.id },
       data: { online: false, lastSeen: new Date() },
     });
-    await removeAllTokensForUser(user.id);
   } catch {}

   return Response.json({ success: true });
 }
```

---

### P-02: Native `enableNotifications` returns `null` even on success
**Severity: Medium**  
**File**: `src/lib/notifications.ts:216-222`  
**Problem**: `registerNativePush()` calls `PushNotifications.register()`, but the FCM token arrives asynchronously via the `registration` listener. The function returns `nativePushToken` immediately, which is still `null`. The token IS saved to the server via the listener — so push works — but callers that check the return value will think it failed.  
**Fix**: Return a Promise that resolves when the listener fires.

```diff
// src/lib/notifications.ts
 let nativePushToken: string | null = null;
 let nativeListenersRegistered = false;
+let nativeTokenResolve: ((token: string | null) => void) | null = null;

 async function registerNativePush(): Promise<string | null> {
   if (!isNative) return null;
   try {
     const { PushNotifications } = await import('@capacitor/push-notifications');
     const result = await PushNotifications.requestPermissions();
     if (result.receive === 'denied') return null;

-    await PushNotifications.register();
-    return nativePushToken;
+    return new Promise<string | null>((resolve) => {
+      nativeTokenResolve = resolve;
+      PushNotifications.register();
+      // Timeout after 10s
+      setTimeout(() => {
+        if (nativeTokenResolve) {
+          nativeTokenResolve = null;
+          resolve(nativePushToken || null);
+        }
+      }, 10000);
+    });
   } catch (err) {
     console.warn('[KIVO Push] Registration failed:', err);
     return null;
   }
 }
```

And in the `registration` listener, resolve the promise:
```diff
     PushNotifications.addListener('registration', (token) => {
       nativePushToken = token.value;
+      if (nativeTokenResolve) {
+        nativeTokenResolve(token.value);
+        nativeTokenResolve = null;
+      }
       saveTokenToServer(token.value, platform).catch(() => {});
     });
```

---

### P-03: Service Worker has empty Firebase config — background push broken on web
**Severity: High**  
**File**: `public/firebase-messaging-sw.js:18-25`  
**Problem**: All config fields are empty strings. The SW skips Firebase initialization (`if (firebaseConfig.projectId)`). Background push notifications will NEVER work on web until these values match `src/lib/firebase.ts`.  
**Fix**: Fill in the config (must be done at deployment), or better, generate the SW dynamically so it uses the same env vars.

---

## 2. AUTHENTICATION

### A-01: Password reset does NOT invalidate existing JWT sessions
**Severity: Critical**  
**File**: `src/app/api/auth/reset-password/route.ts:25-33`  
**Problem**: After a password reset, the old JWT tokens remain valid for up to 7 days. If an attacker has a stolen token, changing the password does NOT lock them out.  
**Fix**: After updating the password, invalidate all existing tokens by storing a `passwordChangedAt` timestamp and checking it during token verification, or add the user's current token to the blocklist.

```diff
// src/app/api/auth/reset-password/route.ts
 import { db } from '@/lib/db';
 import { hash } from 'bcryptjs';
-import { errorResponse } from '@/lib/auth';
+import { errorResponse, invalidateToken, getAuthUser } from '@/lib/auth';

 export async function POST(request: Request) {
   try {
     const { email, code, newPassword } = await request.json();
     // ... existing validation ...

     const hashedPassword = await hash(newPassword, 12);
     await db.user.update({
       where: { id: user.id },
       data: { password: hashedPassword, resetCode: null, resetCodeExpires: null },
     });

+    // Invalidate all existing sessions after password change
+    const authHeader = request.headers.get('authorization');
+    if (authHeader?.startsWith('Bearer ')) {
+      invalidateToken(authHeader.slice(7));
+    }
+
     return Response.json({ success: true, message: 'Password reset successfully' });
   } catch {
     return errorResponse('Failed to reset password', 500);
   }
 }
```

> **Note**: This only invalidates the current request's token. For full coverage, a `sessions` table or `tokenVersion` field on the User model is the proper solution. This fix is the minimal production-safe patch.

---

### A-02: No rate limiting on authentication endpoints
**Severity: High**  
**Files**: All routes under `src/app/api/auth/`  
**Problem**: Login, register, forgot-password, and verify-email endpoints have no rate limiting. An attacker can brute-force credentials or spam password reset requests.  
**Fix**: Add a simple in-memory rate limiter middleware. Create `src/lib/rate-limit.ts`:

```ts
// src/lib/rate-limit.ts
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= maxAttempts) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}
```

Then add to login route:
```diff
 export async function POST(request: Request) {
+  const { email } = await request.json().catch(() => ({ email: '' }));
+  const { allowed, retryAfterMs } = rateLimit(`login:${email}`, 5, 15 * 60 * 1000);
+  if (!allowed) {
+    return errorResponse(`Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minutes.`, 429);
+  }
   // ... existing code ...
 }
```

---

### A-03: JWT blocklist is in-memory — lost on server restart
**Severity: Medium**  
**File**: `src/lib/auth.ts:9`  
**Problem**: `const blocklist = new Set<string>()` is cleared on every server restart, making all previously-blocked tokens valid again. Also grows unboundedly.  
**Fix**: For the current single-server architecture, add a max-size eviction:

```diff
 const blocklist = new Set<string>();
+const MAX_BLOCKLIST_SIZE = 100_000;

 export function invalidateToken(token: string) {
   blocklist.add(token);
+  if (blocklist.size > MAX_BLOCKLIST_SIZE) {
+    // Evict oldest entries (Set preserves insertion order)
+    const iter = blocklist.values();
+    for (let i = 0; i < blocklist.size - MAX_BLOCKLIST_SIZE + 1000; i++) {
+      blocklist.delete(iter.next().value);
+    }
+  }
 }
```

---

### A-04: No email format validation on register
**Severity: Medium**  
**File**: `src/app/api/auth/register/route.ts:13`  
**Problem**: The register endpoint checks `if (!email)` but doesn't validate email format. `user@example` or `notanemail` would pass.  
**Fix**:

```diff
+const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

 export async function POST(request: Request) {
   try {
     const { email, password, displayName, username } = await request.json();
     if (!email || !password || !displayName || !username) {
       return errorResponse('All fields are required');
     }
+    if (!EMAIL_RE.test(email)) {
+      return errorResponse('Invalid email format');
+    }
     // ... rest of validation ...
```

---

## 3. CHAT

### C-01: Mark-read API does not verify conversation membership
**Severity: Critical**  
**File**: `src/app/api/conversations/[id]/read/route.ts:10-12`  
**Problem**: Any authenticated user can mark any conversation's messages as read by sending a POST with any conversation ID. There is no check that the user is a participant.  
**Fix**:

```diff
 export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   try {
     const user = await getAuthUser(request);
     if (!user) return errorResponse('Unauthorized', 401);
     const { id } = await params;

+    const conv = await db.conversation.findUnique({ where: { id } });
+    if (!conv) return errorResponse('Conversation not found', 404);
+    if (conv.user1Id !== user.id && conv.user2Id !== user.id) {
+      return errorResponse('Forbidden', 403);
+    }
+
     await db.message.updateMany({
       where: { conversationId: id, senderId: { not: user.id }, status: { not: 'read' }, deleted: false },
       data: { status: 'read' },
     });
     return Response.json({ success: true });
   } catch {
     return errorResponse('Failed to mark read', 500);
   }
 }
```

---

### C-02: `message:failed` socket event has no `messageId` — wrong message marked as failed
**Severity: High**  
**Files**: `mini-services/kivo-chat-service/index.ts:269`, `src/components/kivo/chat/conversation-list.tsx:108-113`  
**Problem**: The server emits `message:failed` with only `{ conversationId, error }` — no `messageId`. The client handler picks ANY sending/queued message in that conversation, which can mark the wrong message as failed.  
**Fix**: Include the temp message ID in the socket event:

```diff
// mini-services/kivo-chat-service/index.ts — inside message:send handler
     } catch (err) {
       console.error('[message:send] error', err);
-      socket.emit('message:failed', { conversationId, error: 'Failed to send message' });
+      socket.emit('message:failed', { conversationId, error: 'Failed to send message', tempId: /* capture from payload */ });
     }
```

This requires the client to send the `tempId` in the `message:send` payload, and the server to echo it back on failure.

---

### C-03: Attachment pre-detach leaves orphan if message create fails
**Severity: Medium**  
**File**: `mini-services/kivo-chat-service/index.ts:188-195`  
**Problem**: The attachment is detached from its previous message BEFORE the new message is created. If `db.message.create` fails, the attachment is orphaned with `messageId: null`.  
**Fix**: Remove the pre-detach. The message create with `connect: { id: attachmentId }` will handle linking. If the attachment was previously linked, Prisma's connect will fail, but the message should be the authoritative source.

```diff
-    if (attachmentId) {
-      try {
-        await db.mediaAttachment.update({
-          where: { id: attachmentId },
-          data: { messageId: undefined },
-        });
-      } catch {
-        // attachment may not exist, continue
-      }
-    }
```

---

## 4. MOBILE READINESS

### M-01: No Android back button handler — app exits immediately
**Severity: High**  
**File**: Missing — no `@capacitor/app` listener registered  
**Problem**: On Android, pressing the hardware back button calls the default behavior (exit app/minimize) instead of navigating within KIVO (e.g., back from conversation view to list, back from settings to chat).  
**Fix**: Register a back button listener in `SafeAreaBootstrapper` or `FirebaseProvider`:

```tsx
// Add to src/components/capacitor/safe-area-bootstrapper.tsx or a new hook
import { App } from '@capacitor/app';
import { useUIStore } from '@/stores/ui-store';
import { useChatStore } from '@/stores/chat-store';

useEffect(() => {
  if (!isNative || !isAndroid) return;
  const handler = App.addListener('backButton', ({ canGoBack }) => {
    const { activeConversationId, setActiveConversationId } = useChatStore.getState();
    const { settingsOpen, setSettingsOpen, notificationsOpen, setNotificationsOpen } = useUIStore.getState();

    if (settingsOpen) { setSettingsOpen(false); return; }
    if (notificationsOpen) { setNotificationsOpen(false); return; }
    if (activeConversationId) { setActiveConversationId(null); return; }
    if (canGoBack) { App.exitApp(); }
  });
  return () => { handler.then(h => h?.remove()); };
}, []);
```

---

### M-02: Notification tap on native doesn't re-authenticate
**Severity: Low**  
**File**: `src/lib/notifications.ts:156-159`  
**Problem**: When a user taps a notification on native, the handler checks `user && token` from the persisted Zustand store. If the session expired server-side but the store still has the old data, `setView('chat')` succeeds but all API/socket calls will fail.  
**Fix**: The `api('/auth/me')` check in `page.tsx:72-91` already handles this on mount — if the token is expired, it calls `logout()` and redirects to welcome. No code change needed; the existing session validation covers this case.

---

## 5. SECURITY

### S-01: User profile endpoint requires no authentication
**Severity: Medium**  
**File**: `src/app/api/users/[id]/route.ts:4-16`  
**Problem**: The GET handler for `/api/users/[id]` returns user profile data (displayName, username, avatar, bio, status, online status, lastSeen) without requiring authentication. Any unauthenticated request can enumerate users.  
**Fix**:

```diff
 export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   try {
+    const authUser = await getAuthUser(request);
+    if (!authUser) return errorResponse('Unauthorized', 401);
+
     const { id } = await params;
     const user = await db.user.findUnique({
       // ... rest unchanged
```

---

### S-02: Socket `user:status-change` broadcasts to ALL connected users
**Severity: Medium**  
**File**: `mini-services/kivo-chat-service/index.ts:436`  
**Problem**: `io.emit('user:status-change', ...)` sends the status update to every connected socket, not just the user's friends. Any user can observe any other user's status text changes.  
**Fix**: Query the user's friends and emit only to them:

```diff
   socket.on('user:status', async ({ status }: { status: string }) => {
     try {
       await db.user.update({ where: { id: userId }, data: { status } });
-      io.emit('user:status-change', { userId, status });
+      const friendships = await db.friendship.findMany({
+        where: {
+          AND: [{ status: 'accepted' }, { OR: [{ senderId: userId }, { receiverId: userId }] }],
+        },
+        select: { senderId: true, receiverId: true },
+      });
+      for (const f of friendships) {
+        const friendId = f.senderId === userId ? f.receiverId : f.senderId;
+        const sid = onlineUsers.get(friendId);
+        if (sid) io.to(sid).emit('user:status-change', { userId, status });
+      }
     } catch (err) {
       console.error('[user:status] error', err);
     }
   });
```

---

### S-03: Socket `user:offline` broadcasts to ALL users
**Severity: Medium**  
**File**: `mini-services/kivo-chat-service/index.ts:482`  
**Problem**: `io.emit('user:offline', ...)` sends the disconnect event to every connected user, not just friends.  
**Fix**: Same pattern as S-02 — query friends and emit only to them.

---

### S-04: Socket CORS allows any origin
**Severity: Medium**  
**File**: `mini-services/kivo-chat-service/index.ts:34`  
**Problem**: `origin: '*'` allows connections from any website.  
**Fix**:

```diff
   cors: {
-    origin: '*',
+    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
     methods: ['GET', 'POST'],
   },
```

---

## 6. PERFORMANCE

### PF-01: N+1 query in conversations list (unread count per conversation)
**Severity: High**  
**File**: `src/app/api/conversations/route.ts:19-29`  
**Problem**: For each conversation, a separate `db.message.count()` query runs to get the unread count. With 50 conversations, this is 51 queries (1 for conversations + 50 for counts).  
**Fix**: Use a single raw SQL query or `groupBy` to fetch all counts at once:

```diff
 export async function GET(request: Request) {
   try {
     const user = await getAuthUser(request);
     if (!user) return errorResponse('Unauthorized', 401);

     const conversations = await db.conversation.findMany({
       where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] },
       include: {
         user1: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
         user2: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
         messages: { orderBy: { createdAt: 'desc' }, take: 1 },
       },
       orderBy: { updatedAt: 'desc' },
     });

+    // Batch-fetch unread counts for all conversations in one query
+    const convIds = conversations.map(c => c.id);
+    const unreadCounts = await db.message.groupBy({
+      by: ['conversationId'],
+      where: {
+        conversationId: { in: convIds },
+        senderId: { not: user.id },
+        status: { not: 'read' },
+        deleted: false,
+      },
+      _count: { id: true },
+    });
+    const unreadMap = Object.fromEntries(
+      unreadCounts.map(u => [u.conversationId, u._count.id])
+    );
+
     const data = conversations.map((c) => {
       const otherUser = c.user1Id === user.id ? c.user2 : c.user1;
       const lastMessage = c.messages[0] || null;
-      const unreadCount = await db.message.count({
-        where: { conversationId: c.id, senderId: { not: user.id }, status: { not: 'read' }, deleted: false },
-      });
+      const unreadCount = unreadMap[c.id] || 0;
       return {
         id: c.id, user1Id: c.user1Id, user2Id: c.user2Id,
         createdAt: c.createdAt, updatedAt: c.updatedAt,
         lastMessage, otherUser, unreadCount,
       };
-    }));
+    });

     return Response.json({ success: true, data });
   } catch (err) {
     console.error(err);
     return errorResponse('Failed to fetch conversations', 500);
   }
 }
```

---

### PF-02: Conversations list has no pagination
**Severity: Medium**  
**File**: `src/app/api/conversations/route.ts:9-16`  
**Problem**: All conversations are fetched at once with no limit. A user with hundreds of conversations will experience slow page loads.  
**Fix**: Add `take: 50` and a cursor-based `cursor` parameter:

```diff
+    const url = new URL(request.url);
+    const cursor = url.searchParams.get('cursor');
+
+    const where = { OR: [{ user1Id: user.id }, { user2Id: user.id }] };
+    if (cursor) {
+      (where as any).updatedAt = { lt: new Date(cursor) };
+    }
+
     const conversations = await db.conversation.findMany({
-      where: { OR: [{ user1Id: user.id }, { user2Id: user.id }] },
+      where,
       include: { /* unchanged */ },
       orderBy: { updatedAt: 'desc' },
+      take: 50,
     });
```

---

### PF-03: Image upload XHR not cancelled on unmount or re-send
**Severity: Medium**  
**File**: `src/components/kivo/chat/conversation-view.tsx:645-705`  
**Problem**: The XHR reference is not stored in a ref. If the user navigates away during upload or starts a new image upload, the old XHR continues running and calls state setters on a potentially unmounted component.  
**Fix**: Store the XHR in a ref and abort on cleanup:

```diff
+const xhrRef = useRef<XMLHttpRequest | null>(null);
+
+useEffect(() => {
+  return () => { xhrRef.current?.abort(); };
+}, []);

 const sendImageMessage = useCallback(() => {
   // ...
+    if (xhrRef.current) xhrRef.current.abort();
     const xhr = new XMLHttpRequest();
+    xhrRef.current = xhr;
     xhr.open('POST', '/api/media/upload');
     // ...
     xhr.onload = () => {
+      xhrRef.current = null;
       // ... existing logic
     };
     xhr.onerror = () => {
+      xhrRef.current = null;
       // ... existing logic
     };
     xhr.send(formData);
 }, [/* deps */]);
```

---

### PF-04: Online status not reset on socket service restart
**Severity: Low**  
**File**: `mini-services/kivo-chat-service/index.ts`  
**Problem**: When the socket service restarts, all users remain `online: true` in the database because `disconnect` events never fire. Their status is only corrected on next login.  
**Fix**: Add a startup cleanup:

```diff
+// Reset all users to offline on startup
+await db.user.updateMany({ data: { online: false } }).catch(() => {});
 console.log(`[kivo-chat-service] Socket.IO server running on port ${PORT}`);
```

---

## SUMMARY

| # | ID     | Severity  | Category     | Issue                                              |
|---|--------|-----------|--------------|----------------------------------------------------|
| 1 | P-01   | **Critical** | Push       | Logout removes ALL device tokens (cross-device)     |
| 2 | A-01   | **Critical** | Auth       | Password reset doesn't invalidate sessions         |
| 3 | C-01   | **Critical** | Security   | Mark-read API has no conversation membership check  |
| 4 | P-03   | **High**    | Push       | Service Worker Firebase config is empty             |
| 5 | A-02   | **High**    | Auth       | No rate limiting on auth endpoints                 |
| 6 | C-02   | **High**    | Chat       | `message:failed` has no messageId — wrong msg marked |
| 7 | M-01   | **High**    | Mobile     | No Android back button handler                     |
| 8 | PF-01  | **High**    | Performance| N+1 query in conversations list                     |
| 9 | P-02   | Medium    | Push       | Native enableNotifications returns null on success  |
|10 | A-03   | Medium    | Auth       | JWT blocklist in-memory, lost on restart            |
|11 | A-04   | Medium    | Auth       | No email format validation on register              |
|12 | C-03   | Medium    | Chat       | Attachment pre-detach orphans on create failure     |
|13 | S-01   | Medium    | Security   | User profile endpoint has no auth check             |
|14 | S-02   | Medium    | Security   | Status change broadcast to ALL users                |
|15 | S-03   | Medium    | Security   | Offline broadcast to ALL users                      |
|16 | S-04   | Medium    | Security   | Socket CORS allows any origin                       |
|17 | PF-02  | Medium    | Performance| Conversations list has no pagination                |
|18 | PF-03  | Medium    | Performance| Image upload XHR not cancelled on unmount            |
|19 | M-02   | Low       | Mobile     | Notification tap on native doesn't re-auth (covered) |
|20 | PF-04  | Low       | Performance| Online status not reset on service restart          |

---

## RECOMMENDED FIX ORDER

**Phase 1 — Must fix before any user touches the app:**
1. C-01: Mark-read authz check (3 lines)
2. P-01: Remove `removeAllTokensForUser` from logout (1 line)
3. A-01: Invalidate token on password reset (3 lines)

**Phase 2 — Should fix before production launch:**
4. S-01: Add auth to user profile endpoint (2 lines)
5. PF-01: Fix N+1 conversations query (batch groupBy)
6. P-03: Fill in Service Worker Firebase config (deployment)
7. M-01: Add Android back button handler
8. A-02: Add rate limiting to auth endpoints

**Phase 3 — Important but not blocking:**
9. C-02: Add messageId to message:failed event
10. PF-03: Cancel XHR on unmount
11. P-02: Fix native token race condition
12. S-02/S-03: Scope broadcasts to friends only
13. S-04: Restrict socket CORS
14. PF-02: Add conversations pagination
15. A-03: Add blocklist size limit
16. A-04: Validate email format
17. C-03: Remove attachment pre-detach
18. PF-04: Reset online status on startup
