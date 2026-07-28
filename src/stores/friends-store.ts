import { create } from 'zustand';
import type { Friendship, User } from '@/types';

interface FriendsState {
  friends: User[];
  pendingRequests: Friendship[];
  sentRequests: Friendship[];
  searchResults: User[];
  isSearching: boolean;
  isLoading: boolean;
  setFriends: (friends: User[]) => void;
  addFriend: (friend: User) => void;
  removeFriend: (userId: string) => void;
  setPendingRequests: (requests: Friendship[]) => void;
  addPendingRequest: (request: Friendship) => void;
  updateRequestStatus: (id: string, status: string) => void;
  removeRequest: (id: string) => void;
  setSentRequests: (requests: Friendship[]) => void;
  addSentRequest: (request: Friendship) => void;
  removeSentRequest: (id: string) => void;
  setSearchResults: (results: User[]) => void;
  setIsSearching: (searching: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  friends: [] as User[],
  pendingRequests: [] as Friendship[],
  sentRequests: [] as Friendship[],
  searchResults: [] as User[],
  isSearching: false,
  isLoading: false,
};

export const useFriendsStore = create<FriendsState>()((set) => ({
  ...initialState,
  setFriends: (friends) => set({ friends }),
  addFriend: (friend) =>
    set((state) => {
      const exists = state.friends.find((f) => f.id === friend.id);
      if (exists) return state;
      return { friends: [...state.friends, friend] };
    }),
  removeFriend: (userId) =>
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== userId),
    })),
  setPendingRequests: (pendingRequests) => set({ pendingRequests }),
  addPendingRequest: (request) =>
    set((state) => ({
      pendingRequests: [request, ...state.pendingRequests],
    })),
  updateRequestStatus: (id, status) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.map((r) =>
        r.id === id ? { ...r, status } : r
      ),
    })),
  removeRequest: (id) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.id !== id),
    })),
  setSentRequests: (sentRequests) => set({ sentRequests }),
  addSentRequest: (request) =>
    set((state) => {
      const exists = state.sentRequests.find((r) => r.id === request.id);
      if (exists) return state;
      return { sentRequests: [...state.sentRequests, request] };
    }),
  removeSentRequest: (id) =>
    set((state) => ({
      sentRequests: state.sentRequests.filter((r) => r.id !== id),
    })),
  setSearchResults: (searchResults) => set({ searchResults }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set(initialState),
}));
