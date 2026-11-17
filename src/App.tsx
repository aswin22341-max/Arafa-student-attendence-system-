import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { DashboardShell } from './components/DashboardShell.tsx';
import { SignInScreen } from './components/SignInScreen.tsx';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected error.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h1 className="text-lg font-bold text-slate-900">
              Application Error
            </h1>
            <p className="text-sm text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#2D72A8] text-white text-sm font-medium cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthenticatedRoot() {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">
          Loading Arafa English School Portal...
        </div>
      </div>
    );
  }

  if (!admin) {
    return <SignInScreen />;
  }

  return <DashboardShell />;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AuthenticatedRoot />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
