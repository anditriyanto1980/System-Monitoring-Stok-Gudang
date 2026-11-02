import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, LogOut, Clock, Menu, UserCheck, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  activeTabTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, activeTabTitle }) => {
  const { user, signInWithGoogle, logout } = useAuth();
  const [wibTime, setWibTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(now);
      setWibTime(timeStr + ' WIB');
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-hidden"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base md:text-lg font-bold text-slate-800 tracking-tight">
              {activeTabTitle}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <ShieldCheck className="w-3 h-3 text-blue-600" />
              Gudang Terpusat
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden md:block">
            Sistem Pencatatan & Akurasi Kuantitas Fisik Persediaan
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        {/* Real-time WIB Clock */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 font-mono">
          <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="hidden sm:inline">{wibTime}</span>
          <span className="sm:hidden">{wibTime.split(' ')[1] || 'WIB'}</span>
        </div>

        {/* User Account / Auth */}
        {user ? (
          <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
            <div className="flex items-center gap-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                </div>
              )}
              <div className="hidden xl:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.displayName || 'Staf Gudang'}
                </p>
                <p className="text-[10px] text-slate-500 truncate max-w-[140px]">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Keluar (Logout)"
              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signInWithGoogle()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Login Google</span>
          </button>
        )}
      </div>
    </header>
  );
};
