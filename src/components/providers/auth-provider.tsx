'use client';

import { createContext, useContext, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { createClient } from '@/utils/supabase/client';
import { ROUTES } from '@/constants';

const AuthContext = createContext({});

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          // If the user logs out in any tab, redirect this tab to the login page
          router.replace(ROUTES.AUTH.LOGIN);
          router.refresh();
        } else if (event === 'SIGNED_IN') {
          // Sync state if needed
          router.refresh();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  return <AuthContext.Provider value={{}}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
