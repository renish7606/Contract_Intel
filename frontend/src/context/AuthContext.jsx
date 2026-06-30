import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  // ── Restore session from stored JWT on mount ─────────────────────
  useEffect(() => {
    const BACKEND = import.meta.env.VITE_API_URL || 'https://contract-intel.onrender.com';
    const isLocal = /localhost:8000|127\.0\.0\.1:8000/.test(BACKEND);

    // Wake hosted backend (skip for local dev)
    if (!isLocal) {
      fetch(`${BACKEND}/health/`).catch(() => {});
    }

    // Keep-alive ping every 4 min for Render free tier
    const keepAlive = !isLocal
      ? setInterval(() => { fetch(`${BACKEND}/health/`).catch(() => {}); }, 4 * 60 * 1000)
      : null;

    const restoreUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/api/auth/me/');
        setUser(response.data);
      } catch {
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };

    restoreUser();
    return () => { if (keepAlive) clearInterval(keepAlive); };
  }, []);

  // ── Handle Google OAuth credential response ──────────────────────
  const handleGoogleLogin = useCallback(async (credentialResponse) => {
    const token = credentialResponse?.credential;
    if (!token) {
      console.error('Google sign-in returned no credential.', credentialResponse);
      alert('Google sign-in did not return a valid token. Please try again.');
      return;
    }

    try {
      const response = await api.post('/api/auth/google/', {
        token,
        token_type: 'id_token',
      });
      localStorage.setItem('token', response.data.access);
      setUser({
        ...response.data.user,
        picture: response.data.user?.picture || '',
      });
    } catch (error) {
      console.error('Google sign-in failed:', error.response?.data || error);
      const message = error.code === 'ERR_NETWORK'
        ? 'Backend could not be reached. Make sure the Django API is running or deployed, then try Google sign-in again.'
        : (error.response?.data?.error || 'Google sign-in failed. Please try again.');
      alert(message);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const value = {
    user,
    setUser,
    loading,
    isAuthenticated: !!user,
    handleGoogleLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
