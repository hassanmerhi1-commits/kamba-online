import { createContext, useContext } from 'react';
import type { Me, Permission } from './api';

export const MeContext = createContext<Me | null>(null);

export const useMe = () => {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe used outside of login');
  return me;
};

/** True if the signed-in person may use this part of the admin. */
export const useCan = () => {
  const me = useMe();
  return (permission: Permission) => me.permissions.includes(permission);
};
