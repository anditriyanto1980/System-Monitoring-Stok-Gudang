import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged, AuthError } from 'firebase/auth';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from '../firebase';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  isMobileDevice: boolean;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  signInWithGoogle: (preferredMode?: 'auto' | 'popup' | 'redirect') => Promise<boolean>;
  signInWithRedirectMode: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticating: false,
  authError: null,
  isMobileDevice: false,
  isLoginModalOpen: false,
  openLoginModal: () => {},
  closeLoginModal: () => {},
  signInWithGoogle: async () => false,
  signInWithRedirectMode: async () => {},
  logout: async () => {},
  clearAuthError: () => {},
});

// Device detection helper
export const checkIsMobileDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent.toLowerCase()) ||
    (window.innerWidth <= 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  // Check device type
  useEffect(() => {
    setIsMobileDevice(checkIsMobileDevice());
    const handleResize = () => setIsMobileDevice(checkIsMobileDevice());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check for redirect result from mobile browser redirects
  useEffect(() => {
    let isMounted = true;

    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result && result.user && isMounted) {
          setUser(result.user);
          setAuthError(null);
          setIsLoginModalOpen(false);
        }
      } catch (err: any) {
        console.error('Redirect sign-in error:', err);
        if (isMounted) {
          handleAuthErrorMessage(err);
        }
      }
    };

    checkRedirect();

    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (isMounted) {
        setUser(currentUser);
        setLoading(false);
        if (currentUser) {
          setIsLoginModalOpen(false);
          setAuthError(null);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleAuthErrorMessage = (error: any) => {
    const code = error?.code || '';
    if (code === 'auth/popup-blocked') {
      setAuthError('Jendela popup diblokir oleh browser. Gunakan opsi "Masuk via Pengalihan (Redirect)" atau izinkan pop-up di pengaturan browser Anda.');
    } else if (code === 'auth/popup-closed-by-user') {
      setAuthError('Jendela masuk ditutup sebelum proses login selesai.');
    } else if (code === 'auth/cancelled-popup-request') {
      setAuthError('Permintaan login dibatalkan karena ada permintaan baru.');
    } else if (code === 'auth/network-request-failed') {
      setAuthError('Koneksi internet bermasalah. Periksa jaringan Anda dan coba lagi.');
    } else if (code === 'auth/unauthorized-domain') {
      setAuthError('Domain aplikasi belum terdaftar di Firebase Authorized Domains.');
    } else if (code === 'auth/operation-not-allowed') {
      setAuthError('Metode login Google belum diaktifkan di Firebase Authentication.');
    } else {
      setAuthError(error?.message || 'Gagal masuk dengan akun Google. Silakan coba kembali.');
    }
  };

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const openLoginModal = useCallback(() => {
    setAuthError(null);
    setIsLoginModalOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    if (!isAuthenticating) {
      setIsLoginModalOpen(false);
    }
  }, [isAuthenticating]);

  // Mode: 'auto' | 'popup' | 'redirect'
  const signInWithGoogle = async (preferredMode: 'auto' | 'popup' | 'redirect' = 'auto'): Promise<boolean> => {
    setIsAuthenticating(true);
    setAuthError(null);

    // If explicit redirect requested
    if (preferredMode === 'redirect') {
      try {
        await signInWithRedirect(auth, googleProvider);
        return true;
      } catch (err: any) {
        console.error('Redirect login failed:', err);
        handleAuthErrorMessage(err);
        setIsAuthenticating(false);
        return false;
      }
    }

    // Try popup first (even on mobile, many modern browsers allow it if clicked directly from button)
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      setUser(userCredential.user);
      setIsLoginModalOpen(false);
      setIsAuthenticating(false);
      return true;
    } catch (popupErr: any) {
      console.warn('Popup login failed, assessing fallback:', popupErr);

      // If popup was blocked and auto mode is enabled, or on mobile device, try redirect fallback
      const isBlocked = popupErr?.code === 'auth/popup-blocked' ||
                        popupErr?.code === 'auth/cancelled-popup-request';

      if (isBlocked && preferredMode === 'auto') {
        try {
          console.info('Switching to redirect fallback due to popup block...');
          await signInWithRedirect(auth, googleProvider);
          return true;
        } catch (redirectErr: any) {
          console.error('Redirect fallback also failed:', redirectErr);
          handleAuthErrorMessage(redirectErr);
          setIsAuthenticating(false);
          return false;
        }
      } else {
        handleAuthErrorMessage(popupErr);
        setIsAuthenticating(false);
        return false;
      }
    }
  };

  const signInWithRedirectMode = async () => {
    await signInWithGoogle('redirect');
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setAuthError(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticating,
        authError,
        isMobileDevice,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
        signInWithGoogle,
        signInWithRedirectMode,
        logout,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
