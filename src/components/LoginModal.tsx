import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LogIn,
  X,
  Smartphone,
  Laptop,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

export const LoginModal: React.FC = () => {
  const {
    isLoginModalOpen,
    closeLoginModal,
    signInWithGoogle,
    signInWithRedirectMode,
    isAuthenticating,
    authError,
    clearAuthError,
    isMobileDevice,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'options' | 'help'>('options');

  if (!isLoginModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white relative">
          <button
            onClick={closeLoginModal}
            disabled={isAuthenticating}
            className="absolute top-4 right-4 p-1 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            aria-label="Tutup modal login"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="p-1.5 rounded-lg bg-white/10 border border-white/20">
              <ShieldCheck className="w-5 h-5 text-blue-200" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-100">
              Autentikasi Staf Gudang
            </span>
          </div>

          <h2 id="login-modal-title" className="text-lg font-bold text-white leading-tight">
            Masuk Sistem Monitoring Stok
          </h2>
          <p className="text-xs text-blue-100/90 mt-1">
            Gunakan Akun Google resmi untuk mencatat pergerakan stok, import transaksi, dan stok opname.
          </p>

          {/* Device indicator pill */}
          <div className="mt-3.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[11px] font-medium text-white border border-white/20">
            {isMobileDevice ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-amber-300" />
                <span>Terdeteksi: Perangkat Mobile (Smartphone / Tablet)</span>
              </>
            ) : (
              <>
                <Laptop className="w-3.5 h-3.5 text-emerald-300" />
                <span>Terdeteksi: Komputer / Laptop Desktop</span>
              </>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* Error Message Box if any */}
          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Kendala Login Terdeteksi</p>
                <p className="mt-0.5 text-rose-700 leading-relaxed">{authError}</p>
                {authError.includes('popup') && (
                  <button
                    onClick={() => {
                      clearAuthError();
                      signInWithRedirectMode();
                    }}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Coba Langsung via Mode Pengalihan (Redirect)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab Selector */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('options')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'options'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Pilihan Login
            </button>
            <button
              onClick={() => setActiveTab('help')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1 ${
                activeTab === 'help'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Bantuan Semua Perangkat
            </button>
          </div>

          {activeTab === 'options' ? (
            <div className="space-y-3 pt-1">
              {/* Primary Option: Popup Login (fast for desktop, works on mobile with user gesture) */}
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => signInWithGoogle('popup')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 border-blue-600 bg-blue-50/50 hover:bg-blue-100/60 transition-all text-left group disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white shadow-xs border border-slate-200 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-800">
                        Masuk Cepat Google (Jendela Popup)
                      </p>
                      {!isMobileDevice && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-blue-600 text-white rounded font-medium">
                          Rekomendasi PC
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Membuka jendela login Google tanpa meninggalkan halaman
                    </p>
                  </div>
                </div>
                {isAuthenticating ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                ) : (
                  <LogIn className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                )}
              </button>

              {/* Secondary Option: Redirect Login (Recommended for mobile iOS Safari, Android Chrome, webviews) */}
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => signInWithRedirectMode()}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 transition-all text-left group disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-600">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-800">
                        Masuk via Pengalihan (Redirect)
                      </p>
                      {isMobileDevice && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-emerald-600 text-white rounded font-medium">
                          Rekomendasi HP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Aman untuk iPhone / Safari / Chrome HP jika pop-up diblokir
                    </p>
                  </div>
                </div>
                {isAuthenticating ? (
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
                ) : (
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                )}
              </button>

              {/* Multi-Device Security Guarantee */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sesi tersimpan otomatis (Auto-Persistence)
                </span>
                <span className="text-slate-400">Firebase Auth</span>
              </div>
            </div>
          ) : (
            /* Help & Multi-device Tips */
            <div className="space-y-3 text-xs text-slate-600 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  Pengguna HP Android & iPhone (iOS Safari):
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Jika tombol popup tidak muncul atau diblokir oleh browser ponsel, tekan{' '}
                  <strong className="text-blue-700">"Masuk via Pengalihan (Redirect)"</strong>. Halaman akan beralih ke akun Google Anda dan kembali otomatis dengan status login aktif.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                  <Laptop className="w-3.5 h-3.5 text-blue-600" />
                  Pengguna Komputer & Laptop:
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Gunakan tombol <strong className="text-blue-700">"Masuk Cepat Google (Popup)"</strong> untuk proses instan tanpa refresh halaman.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Multi-Pengguna Gudang:
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Seluruh staf gudang yang login dari perangkat berbeda (komputer kasir, tablet gudang, atau HP kurir) akan selalu melihat data stok terpusat yang sama secara real-time.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Sistem Monitoring Stok Gudang</span>
          <button
            type="button"
            disabled={isAuthenticating}
            onClick={closeLoginModal}
            className="text-slate-600 hover:text-slate-900 font-medium py-1 px-2.5 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
