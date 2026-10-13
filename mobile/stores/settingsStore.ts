import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchSettings } from '@/lib/api';

interface SettingsState {
  /** Digits only with country code, set by the admin. Empty = WhatsApp ordering is switched off. */
  whatsappNumber: string;
  officePhone: string;
  load: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      whatsappNumber: '',
      officePhone: '',

      // Keeps the last known numbers if the server cannot be reached.
      load: async () => {
        try {
          const s = await fetchSettings();
          set({ whatsappNumber: s.whatsapp_number, officePhone: s.main_office_phone });
        } catch {
          /* offline: keep what we have */
        }
      },
    }),
    {
      name: 'kamba-online-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ whatsappNumber: s.whatsappNumber, officePhone: s.officePhone }),
    }
  )
);
