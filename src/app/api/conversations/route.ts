import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, stripPassword } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const currentUser = await getAuthUser(request)
    if (!currentUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const conversations = await db.conversation.findMany({
      where: {
        OR: [
          { user1Id: currentUser.id },
          { user2Id: currentUser.id },
        ],
      },
      include: {
        user1: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
        user2: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
    const data = await Promise.all(conversations.map(async (c) => {
      const otherUser = c.user1Id === currentUser.id ? c.user2 : c.user1
      const lastMessage = c.messages[0] || null
      const unreadCount = await db.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: currentUser.id },
          status: { not: 'read' },
          deleted: false,
        },
      })
      return {
        id: c.id,
        user1Id: c.user1Id,
        user2Id: c.user2Id,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessage,
        otherUser,
        unreadCount,
      }
    }))
    return NextResponse.json({ success: true, data: { conversations: data } })
  } catch (error) {
    console.error('List conversations error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getAuthUser(request)
    if (!currentUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 })
    const friendship = await db.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { senderId: currentUser.id, receiverId: userId },
          { senderId: userId, receiverId: currentUser.id },
        ],
      },
    })
    if (!friendship) return NextResponse.json({ success: false, error: 'Not friends' }, { status: 403 })
    const [user1Id, user2Id] = currentUser.id < userId ? [currentUser.id, userId] : [userId, currentUser.id]
    const conversation = await db.conversation.upsert({
      where: { user1Id_user2Id: { user1Id, user2Id } },
      create: { user1Id, user2Id },
      update: {},
      include: {
        user1: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
        user2: { select: { id: true, displayName: true, username: true, avatar: true, online: true, lastSeen: true } },
      },
    })
    const otherUser = conversation.user1Id === currentUser.id ? conversation.user2 : conversation.user1
    return NextResponse.json({ success: true, data: { conversation: { ...conversation, otherUser } } })
  } catch (error) {
    console.error('Create conversation error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
