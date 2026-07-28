import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getAuthUser(request)
    if (!currentUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    if (conversation.user1Id !== currentUser.id && conversation.user2Id !== currentUser.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    await db.message.updateMany({
      where: { conversationId: id, senderId: { not: currentUser.id }, status: { not: 'read' }, deleted: false },
      data: { status: 'read' },
    })
    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    console.error('Read messages error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
