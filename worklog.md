# KIVO Worklog

## Task 4 – KIVO Socket.io Chat Service

### Date: 2025

### Summary
Built a standalone Socket.io real-time messaging mini-service at `mini-services/kivo-chat-service/`.

### Files Created
| File | Purpose |
|------|---------|
| `mini-services/kivo-chat-service/package.json` | Bun project with socket.io dependency |
| `mini-services/kivo-chat-service/tsconfig.json` | TypeScript config (ES2022, bundler moduleResolution) |
| `mini-services/kivo-chat-service/index.ts` | Main Socket.io server on port 3003 |

### Socket Events Handled
| Event | Direction | Description |
|-------|-----------|-------------|
| `auth` | client→server | Authenticate with userId, mark online |
| `message:send` | client→server | Save message to DB, emit `message:new` to recipient |
| `message:edit` | client→server | Update message content, emit `message:updated` |
| `message:delete` | client→server | Soft-delete, emit `message:deleted` |
| `message:read` | client→server | Mark as read, emit `message:read` to sender |
| `typing:start` | client→server | Emit `user:typing` with isTyping: true |
| `typing:stop` | client→server | Emit `user:typing` with isTyping: false |
| `user:status` | client→server | Update status text, broadcast `user:status-change` |
| `disconnect` | automatic | Mark offline, broadcast `user:offline` |

### Key Design Decisions
- `path: '/'` on Socket.IO (required for Caddy reverse-proxy routing)
- Uses parent project's `db` client via `import { db } from '../../src/lib/db'`
- Two maps for tracking: `onlineUsers` (userId→socketId) and `socketToUser` (socketId→userId)
- Graceful shutdown via SIGTERM/SIGINT handlers

### Verification
- `bun install` resolved socket.io 4.8.3 successfully
- Server starts and listens on port 3003, graceful shutdown works
## Task 6 – KIVO API Routes

### Date: 2025

### Summary
Built all 16 API routes plus auth middleware for KIVO messaging platform.

### Files Created
| File | Purpose |
|------|--------|
| src/lib/auth.ts | Auth middleware: generateToken, verifyToken, getAuthUser, stripPassword |
| src/app/api/auth/register/route.ts | POST register with email/username uniqueness, bcrypt hashing |
| src/app/api/auth/login/route.ts | POST login with bcrypt verify |
| src/app/api/auth/me/route.ts | GET current user (protected) |
| src/app/api/users/[id]/route.ts | GET public profile, PUT update own profile (protected) |
| src/app/api/users/search/route.ts | GET search users by name/username (protected) |
| src/app/api/friends/request/route.ts | POST send friend request (protected) |
| src/app/api/friends/accept/route.ts | POST accept friend + create conversation (protected) |
| src/app/api/friends/decline/route.ts | POST decline friend request (protected) |
| src/app/api/friends/remove/route.ts | POST remove friend (protected) |
| src/app/api/friends/cancel/route.ts | POST cancel sent request (protected) |
| src/app/api/friends/list/route.ts | GET list accepted friends (protected) |
| src/app/api/friends/requests/route.ts | GET pending received requests (protected) |
| src/app/api/conversations/route.ts | GET list conversations + POST find/create (protected) |
| src/app/api/conversations/[id]/messages/route.ts | GET messages + PUT edit message (protected) |
| src/app/api/conversations/[id]/read/route.ts | POST mark messages as read (protected) |
| src/app/api/messages/[id]/route.ts | DELETE soft-delete message (protected) |

### Key Design Decisions
- In-memory token map (userId -> token) for simple auth
- Consistent conversation ordering: smaller userId as user1Id
- All responses: { success, data?, error? } with proper HTTP status codes
- stripPassword helper removes password from user objects
- Messages auto-marked as delivered on fetch
- Message deletion: soft delete, own messages always, others within 1 hour
- Conversation unreadCount computed via message count query
- Block check before sending friend requests

### Verification
- db:push: schema already in sync
- lint: 0 errors
- dev server compiles without errors
