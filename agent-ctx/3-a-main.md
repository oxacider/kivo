# Task 3-a: Fix ChatLayout routing and wire navigation components

## Agent: main

## Summary
Fixed the ChatLayout in `src/app/page.tsx` to properly use `mainTab` from the UI store, render DesktopSidebar and MobileBottomNav, and add overlay UIs for settings and notifications.

## Changes Made

### File: `src/app/page.tsx` (full rewrite)

**Imports added:**
- `DesktopSidebar` from `@/components/kivo/navigation/desktop-sidebar`
- `MobileBottomNav` from `@/components/kivo/navigation/mobile-bottom-nav`
- `FriendsPage` from `@/components/kivo/friends/friends-page`
- `ProfilePage` from `@/components/kivo/profile/profile-page`
- `GlobalSearchOverlay` from `@/components/kivo/overlays/global-search-overlay`
- `Sheet`, `SheetContent` from `@/components/ui/sheet`
- `Bell` from `lucide-react`

**Removed from viewConfig:**
- `settings`, `profile`, `friends` entries (no longer top-level views)

**Removed from render:**
- `{currentView === 'settings' && <SettingsPanel />}` line

**Rewrote ChatLayout function:**
1. Reads `mainTab`, `settingsOpen`, `setSettingsOpen`, `notificationsOpen`, `setNotificationsOpen` from `useUIStore`
2. Reads `activeConversationId` from `useChatStore`
3. Render structure:
   - `<DesktopSidebar />` — always rendered (it hides itself on mobile via `hidden md:flex`)
   - Main content `<div className="flex-1 h-full overflow-hidden">` that switches on `mainTab`:
     - `'chat'` → ConversationList + ConversationView (same layout as before)
     - `'friends'` → `<FriendsPage />`
     - `'profile'` → `<ProfilePage />`
   - `<MobileBottomNav />` — always rendered (it hides itself on desktop via `md:hidden`)
   - Settings `<Sheet>` with `<SettingsPanel />` inside, controlled by `settingsOpen`/`setSettingsOpen`
   - Notifications `<Sheet>` with a placeholder empty state, controlled by `notificationsOpen`/`setNotificationsOpen`
   - `<GlobalSearchOverlay />` — always rendered (controls its own visibility via `searchOpen`)

## Verification
- ESLint: clean (no errors or warnings)
- Dev server: compiles successfully, page serves 200
- No visual regressions in existing chat flow
