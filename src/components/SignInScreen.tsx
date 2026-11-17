import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export function SignInScreen() {
  const { signIn, authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password) {
      setLocalError('Please enter both administrator username and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(username, password);
    } catch {
      // authError is already populated by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50/90 flex flex-col justify-between">
      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md bg-white border border-slate-200/85 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)] rounded-2xl p-7 sm:p-8 space-y-5">
          <div className="flex items-center justify-center pb-5 border-b border-slate-100">
            <img
              src="/assets/aistudio/logo-light_8b7c036c.png"
              alt="Arafa English School"
              referrerPolicy="no-referrer"
              className="w-full max-w-[280px] sm:max-w-[340px] max-h-24 h-auto object-contain"
            />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 text-center">
            Administrator Login
          </h1>

          {displayError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
            >
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-username"
                className="block text-xs font-medium text-slate-700"
              >
                Admin Username
              </label>
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2D72A8] focus:border-[#2D72A8]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2D72A8] focus:border-[#2D72A8]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {submitting ? 'Signing In...' : 'Sign In to Dashboard'}
            </button>
          </form>

          <p className="text-xs text-slate-500 pt-3 border-t border-slate-100 leading-relaxed">
            Initial credentials:{' '}
            <span className="font-sans text-slate-700">admin</span> /{' '}
            <span className="font-sans text-slate-700">Arafa@2026</span>
          </p>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Arafa English School · Attur (CBSE Affiliation No. 930181)</span>
          <span>RFID Attendance Portal</span>
        </div>
      </footer>
    </div>
  );
}
