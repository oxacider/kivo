'use client';

export function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="h-11 w-11 shrink-0 rounded-full bg-surface-2 animate-pulse" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-28 rounded bg-surface-2 animate-pulse" />
        <div className="h-3 w-40 rounded bg-surface-2 animate-pulse" />
      </div>
      <div className="h-3 w-10 shrink-0 rounded bg-surface-2 animate-pulse" />
    </div>
  );
}

export function MessageSkeleton({ isMine = false }: { isMine?: boolean }) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className="rounded-2xl px-4 py-2.5 bg-surface-2">
        <div className="h-3.5 w-48 rounded bg-surface-3 animate-pulse" />
        <div className="mt-1.5 h-2.5 w-20 rounded bg-surface-3 animate-pulse" />
      </div>
    </div>
  );
}

export function FriendSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-2">
      <div className="h-8 w-8 rounded-full bg-surface-2 animate-pulse" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-24 rounded bg-surface-2 animate-pulse" />
        <div className="h-2.5 w-16 rounded bg-surface-2 animate-pulse" />
      </div>
    </div>
  );
}
