import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, LogOut, Clock, Menu, ShieldCheck, UserCheck, Smartphone } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  activeTabTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, activeTabTitle }) => {
  const { user, openLoginModal, logout, isMobileDevice } = useAuth();
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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 md:px-8 py-3 flex items-center justify-between shadow-xs">
      <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-hidden touch-manipulation active:scale-95 transition-transform"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate">
            <h1 className="text-sm md:text-lg font-bold text-slate-800 tracking-tight truncate">
              {activeTabTitle}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
              <ShieldCheck className="w-3 h-3 text-blue-600" />
              Gudang Terpusat
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden md:block">
            Sistem Pencatatan & Akurasi Kuantitas Fisik Persediaan
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {/* Real-time WIB Clock */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 font-mono">
          <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{wibTime}</span>
        </div>

        {/* User Account / Auth */}
        {user ? (
          <div className="flex items-center gap-2 md:gap-3 pl-2 border-l border-slate-200">
            <div className="flex items-center gap-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.displayName || 'Staf Gudang'}
                </p>
                <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                  {user.email}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Keluar (Logout)"
              className="p-2 md:p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors touch-manipulation"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={openLoginModal}
            className="flex items-center gap-1.5 md:gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold transition-all shadow-xs touch-manipulation min-h-[38px]"
          >
            <LogIn className="w-4 h-4 shrink-0" />
            <span>Login Google</span>
          </button>
        )}
      </div>
    </header>
  );
};
