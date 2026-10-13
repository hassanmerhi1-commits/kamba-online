import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UserProfile } from '@/types';
import { ApiError, fetchMe, loginRequest, registerRequest } from '@/lib/api';

interface AuthState {
  user: UserProfile | null;
  /** Session token for registered customers (guests have none). */
  token: string | null;
  setGuest: (name: string, phone: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string, phone: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      setGuest: (name, phone) => {
        set({
          token: null,
          user: { id: `guest-${Date.now()}`, email: null, full_name: name, phone, is_guest: true },
        });
      },

      login: async (email, password) => {
        try {
          const { token, user } = await loginRequest(email, password);
          set({ token, user: { ...user, is_guest: false } });
          return true;
        } catch {
          return false;
        }
      },

      register: async (email, password, fullName, phone) => {
        try {
          const { token, user } = await registerRequest(email, password, fullName, phone);
          set({ token, user: { ...user, is_guest: false } });
          return true;
        } catch {
          return false;
        }
      },

      logout: async () => {
        set({ user: null, token: null });
      },

      // On app start: make sure a saved login is still valid on the server.
      hydrate: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const me = await fetchMe(token);
          set({ user: { ...me, is_guest: false } });
        } catch (err) {
          // Only sign out if the server says the session is invalid, not when it is just unreachable.
          if (err instanceof ApiError && err.status === 401) set({ user: null, token: null });
        }
      },
    }),
    {
      name: 'kamba-online-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
