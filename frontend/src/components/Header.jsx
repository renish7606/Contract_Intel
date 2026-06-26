import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Shield, ChevronDown, LogOut, LayoutDashboard, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { user, isAuthenticated, handleGoogleLogin, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    logout();
    navigate('/');
  };

  // Smooth scroll for anchor links on the landing page
  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Initials avatar fallback
  const getInitials = () => {
    if (!user) return '?';
    const first = user.first_name?.[0] || '';
    const email = user.email?.[0] || '';
    return (first || email).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-gray-100">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        {/* ── Logo ───────────────────────────────────────── */}
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2 group">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm group-hover:shadow-md transition-shadow">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 tracking-tight">
            Contract<span className="text-blue-600">Intel</span>
          </span>
        </Link>

        {/* ── Desktop Nav + Auth ─────────────────────────── */}
        <div className="hidden sm:flex items-center gap-6">
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard"
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  location.pathname === '/dashboard'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>

              {/* Avatar dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  {user?.picture ? (
                    <img
                      src={user.picture}
                      alt=""
                      className="w-8 h-8 rounded-full ring-2 ring-blue-100"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-blue-100">
                      {getInitials()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">
                    {user?.first_name || user?.email?.split('@')[0]}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user?.first_name || 'User'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('privacy')}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                Privacy
              </button>
              <div className="scale-90 origin-right">
                <GoogleLogin
                  onSuccess={handleGoogleLogin}
                  onError={() => alert('Google sign-in failed. Please try again.')}
                  shape="pill"
                  size="medium"
                  text="signin_with"
                  theme="outline"
                  width="200"
                />
              </div>
            </>
          )}
        </div>

        {/* ── Mobile Menu Button ─────────────────────────── */}
        <button
          className="sm:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* ── Mobile Menu Panel ───────────────────────────── */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-100 bg-white px-6 py-4 space-y-3">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                {user?.picture ? (
                  <img src={user.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    {getInitials()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">{user?.first_name || 'User'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                How It Works
              </button>
              <button
                onClick={() => scrollToSection('privacy')}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Privacy
              </button>
              <div className="pt-2">
                <GoogleLogin
                  onSuccess={(cr) => { setMobileMenuOpen(false); handleGoogleLogin(cr); }}
                  onError={() => alert('Google sign-in failed. Please try again.')}
                  shape="pill"
                  size="large"
                  text="signin_with"
                  theme="outline"
                  width="100%"
                />
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
