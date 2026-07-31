import { createServer } from 'http'
import { Server } from 'socket.io'
import { db } from '../../src/lib/db'
import * as jose from 'jose'

// ---------------------------------------------------------------------------
// JWT Verification (shared secret with main app)
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters')
}
const secretKey = new TextEncoder().encode(JWT_SECRET)

async function verifySocketToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secretKey, { algorithms: ['HS256'] })
    return (payload as { userId?: string }).userId ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// HTTP + Socket.IO server
// ---------------------------------------------------------------------------

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ---------------------------------------------------------------------------
// Online-users tracking
// ---------------------------------------------------------------------------

/** userId → socketId */
const onlineUsers = new Map<string, string>()
/** socketId → userId */
const socketToUser = new Map<string, string>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getConversation(convId: string) {
  return db.conversation.findUnique({ where: { id: convId } })
}

function isParticipant(conv: { user1Id: string; user2Id: string } | null, userId: string): boolean {
  if (!conv) return false
  return conv.user1Id === userId || conv.user2Id === userId
}

function getOtherUserId(conv: { user1Id: string; user2Id: string }, myUserId: string): string {
  return conv.user1Id === myUserId ? conv.user2Id : conv.user1Id
}

async function isBlocked(userId1: string, userId2: string): Promise<boolean> {
  const count = await db.block.count({
    where: {
      OR: [
        { blockerId: userId1, blockedId: userId2 },
        { blockerId: userId2, blockedId: userId1 },
      ],
    },
  })
  return count > 0
}

function emitToUser(userId: string, event: string, data: unknown) {
  const socketId = onlineUsers.get(userId)
  if (socketId) {
    io.to(socketId).emit(event, data)
  }
}

async function getSenderInfo(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, avatar: true },
  })
  return user
}

function getMessageWithExtras(messageId: string) {
  return db.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatar: true } },
      replyTo: { select: { id: true, content: true, senderId: true } },
      reactions: {
        include: {
          user: { select: { id: true, displayName: true, avatar: true } },
        },
      },
      attachments: true,
    },
  })
}

// ---------------------------------------------------------------------------
// Socket authentication middleware
// ---------------------------------------------------------------------------

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) {
    return next(new Error('Authentication required'))
  }

  const userId = await verifySocketToken(token)
  if (!userId) {
    return next(new Error('Invalid or expired token'))
  }

  // Verify user exists in DB
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return next(new Error('User not found'))
  }

  // Attach userId to socket data
  socket.data.userId = userId
  next()
})

// ---------------------------------------------------------------------------
// Socket connection handler
// ---------------------------------------------------------------------------

io.on('connection', async (socket) => {
  const userId: string = socket.data.userId
  console.log(`[socket] authenticated: ${userId} (${socket.id})`)

  // Track online
  onlineUsers.set(userId, socket.id)
  socketToUser.set(socket.id, userId)
  await db.user.update({
    where: { id: userId },
    data: { online: true, lastSeen: new Date() },
  })

  socket.emit('auth:success', { userId })
  console.log(`[auth] ${userId} is now online (${onlineUsers.size} total)`)

  // -----------------------------------------------------------------------
  // message:send – save message to DB & deliver to recipient
  // -----------------------------------------------------------------------
  socket.on(
    'message:send',
    async ({
      conversationId,
      content,
      type,
      replyToId,
      attachmentId,
    }: {
      conversationId: string
      content: string
      type?: string
      replyToId?: string
      attachmentId?: string
    }) => {
      try {
        // Validate conversation membership
        const conv = await getConversation(conversationId)
        if (!isParticipant(conv, userId)) return

        // Validate no block between participants
        const otherId = getOtherUserId(conv, userId)
        if (await isBlocked(userId, otherId)) return

        // For text messages, validate content
        const msgType = type ?? 'text'
        if (msgType === 'text' && (!content || typeof content !== 'string' || content.length > 10000)) return

        // Link attachment to the message if provided
        if (attachmentId) {
          try {
            await db.mediaAttachment.update({
              where: { id: attachmentId },
              data: { messageId: undefined }, // detach first (no-op if not linked)
            })
          } catch {
            // attachment may not exist, continue
          }
        }

        const message = await db.message.create({
          data: {
            conversationId,
            senderId: userId,
            content: content || '',
            type: msgType,
            replyToId: replyToId ?? null,
            status: 'sent',
            attachments: attachmentId
              ? { connect: { id: attachmentId } }
              : undefined,
          },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true },
            },
            replyTo: {
              select: { id: true, content: true, senderId: true },
            },
            reactions: {
              include: {
                user: { select: { id: true, displayName: true, avatar: true } },
              },
            },
            attachments: true,
          },
        })

        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })

        // Emit to sender as 'sent' confirmation
        socket.emit('message:new', message)

        // Emit to recipient
        emitToUser(otherId, 'message:new', message)

        // If recipient is online, immediately mark as delivered
        if (onlineUsers.has(otherId)) {
          await db.message.update({
            where: { id: message.id },
            data: { status: 'delivered' },
          })
          socket.emit('message:delivered', { messageId: message.id, conversationId, status: 'delivered' })
        }
      } catch (err) {
        console.error('[message:send] error', err)
        socket.emit('message:failed', { conversationId, error: 'Failed to send message' })
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:edit
  // -----------------------------------------------------------------------
  socket.on(
    'message:edit',
    async ({ messageId, content }: { messageId: string; content: string }) => {
      try {
        const msg = await db.message.findUnique({ where: { id: messageId } })
        if (!msg || msg.senderId !== userId || msg.deleted) return

        // Verify sender is still a participant
        const conv = await getConversation(msg.conversationId)
        if (!isParticipant(conv, userId)) return

        const updated = await db.message.update({
          where: { id: messageId, senderId: userId, deleted: false },
          data: { content, edited: true, updatedAt: new Date() },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatar: true },
            },
          },
        })

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'message:updated', updated)
        socket.emit('message:updated', updated)
      } catch (err) {
        console.error('[message:edit] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:delete
  // -----------------------------------------------------------------------
  socket.on(
    'message:delete',
    async ({ messageId }: { messageId: string }) => {
      try {
        const msg = await db.message.findUnique({ where: { id: messageId } })
        if (!msg || msg.senderId !== userId) return

        const conv = await getConversation(msg.conversationId)
        if (!isParticipant(conv, userId)) return

        await db.message.update({
          where: { id: messageId },
          data: { deleted: true, content: '', updatedAt: new Date() },
        })

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'message:deleted', { messageId, conversationId: msg.conversationId })
        socket.emit('message:deleted', { messageId, conversationId: msg.conversationId })
      } catch (err) {
        console.error('[message:delete] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // message:read
  // -----------------------------------------------------------------------
  socket.on(
    'message:read',
    async ({ conversationId }: { conversationId: string }) => {
      try {
        const conv = await getConversation(conversationId)
        if (!isParticipant(conv, userId)) return

        const result = await db.message.updateMany({
          where: { conversationId, senderId: { not: userId }, status: { not: 'read' } },
          data: { status: 'read' },
        })

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'message:read', { conversationId, userId, count: result.count })
      } catch (err) {
        console.error('[message:read] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // reaction:add
  // -----------------------------------------------------------------------
  socket.on(
    'reaction:add',
    async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      try {
        const msg = await db.message.findUnique({ where: { id: messageId } })
        if (!msg || msg.deleted) return

        const conv = await getConversation(msg.conversationId)
        if (!isParticipant(conv, userId)) return

        // Block self-reactions
        if (msg.senderId === userId) return

        // Upsert: toggle reaction
        const existing = await db.reaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId, emoji } },
        })

        let reactionData: any
        if (existing) {
          // Remove existing reaction (toggle off)
          await db.reaction.delete({ where: { id: existing.id } })
          reactionData = { messageId, userId, emoji, removed: true }
        } else {
          // Remove any other reaction by this user on this message first
          await db.reaction.deleteMany({ where: { messageId, userId } })
          // Create new reaction
          const reaction = await db.reaction.create({
            data: { messageId, userId, emoji },
            include: { user: { select: { id: true, displayName: true, avatar: true } } },
          })
          reactionData = reaction
        }

        const otherId = getOtherUserId(conv, userId)
        emitToUser(otherId, 'reaction:update', reactionData)
        socket.emit('reaction:update', reactionData)
      } catch (err) {
        console.error('[reaction:add] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // typing:start / typing:stop
  // -----------------------------------------------------------------------
  socket.on(
    'typing:start',
    async ({ conversationId }: { conversationId: string }) => {
      const conv = await getConversation(conversationId)
      if (!isParticipant(conv, userId)) return
      const otherId = getOtherUserId(conv, userId)
      const sender = await getSenderInfo(userId)
      emitToUser(otherId, 'user:typing', { conversationId, userId, isTyping: true, user: sender })
    },
  )

  socket.on(
    'typing:stop',
    async ({ conversationId }: { conversationId: string }) => {
      const conv = await getConversation(conversationId)
      if (!isParticipant(conv, userId)) return
      const otherId = getOtherUserId(conv, userId)
      emitToUser(otherId, 'user:typing', { conversationId, userId, isTyping: false })
    },
  )

  // -----------------------------------------------------------------------
  // user:status
  // -----------------------------------------------------------------------
  socket.on(
    'user:status',
    async ({ status }: { status: string }) => {
      try {
        await db.user.update({ where: { id: userId }, data: { status } })
        io.emit('user:status-change', { userId, status })
      } catch (err) {
        console.error('[user:status] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // user:presence – get online status + last seen of a user
  // -----------------------------------------------------------------------
  socket.on(
    'user:presence',
    async ({ userId: targetUserId }: { userId: string }) => {
      try {
        const target = await db.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, online: true, lastSeen: true, showOnline: true, showLastSeen: true },
        })
        if (target) {
          socket.emit('user:presence:response', {
            userId: target.id,
            online: target.showOnline ? target.online : false,
            lastSeen: target.showLastSeen ? target.lastSeen.toISOString() : null,
          })
        }
      } catch (err) {
        console.error('[user:presence] error', err)
      }
    },
  )

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------
  socket.on('disconnect', async () => {
    onlineUsers.delete(userId)
    socketToUser.delete(socket.id)

    try {
      await db.user.update({
        where: { id: userId },
        data: { online: false, lastSeen: new Date() },
      })
    } catch (err) {
      console.error('[disconnect] failed to update user', err)
    }

    io.emit('user:offline', { userId, lastSeen: new Date().toISOString() })
    console.log(`[disconnect] ${userId} went offline (${onlineUsers.size} still online)`)
  })

  socket.on('error', (error) => {
    console.error(`[socket] error (${socket.id}):`, error)
  })
})

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[kivo-chat-service] Socket.IO server running on port ${PORT}`)
})

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string) {
  console.log(`[kivo-chat-service] received ${signal}, shutting down...`)
  io.close()
  httpServer.close(() => {
    console.log('[kivo-chat-service] server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
