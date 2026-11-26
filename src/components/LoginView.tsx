import React, { useState } from 'react';
import {
  ArrowRight,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Moon,
  RefreshCw,
  Sun,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';

export function LoginView() {
  const {
    user,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    resendVerificationEmail,
    refreshAuthUser,
    logout,
    darkMode,
    toggleDarkMode,
  } = useStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const targetEmail = email.trim();
      if (!targetEmail) {
        throw new Error('Ingresa tu correo electrónico.');
      }
      if (mode === 'login') {
        await loginWithEmail(targetEmail, password);
      } else {
        if (password.length < 6) {
          throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }
        await registerWithEmail(
          nombre.trim() || 'Personal Alquia',
          targetEmail,
          password
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo completar el acceso.';
      if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
        setError(
          'Correo o contraseña incorrectos. Si es tu primera vez, selecciona "Regístrate aquí" para crear tu cuenta.'
        );
      } else if (msg.includes('user-not-found')) {
        setError('Esta cuenta no existe todavía. Selecciona "Regístrate aquí" para crearla.');
      } else if (msg.includes('email-already-in-use')) {
        setError('Este correo ya está registrado. Inicia sesión con tu contraseña.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const isNativeApp =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    );

  const handleGoogle = async () => {
    if (isNativeApp) {
      setError(
        'En la aplicación Android inicia sesión directamente con tu correo electrónico y contraseña.'
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google. Verifica tu ventana emergente.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Pantalla de verificación de correo si el usuario inició sesión con correo sin verificar
  if (user && user.modo === 'firebase' && !user.emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F8] dark:bg-[#0B0B0D] p-6">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-8 alquia-card text-center space-y-5">
          <img
            src="/alquia-ticket-logo.svg"
            alt="Mueblería Alquia"
            className="h-24 w-auto mx-auto object-contain rounded-xl bg-white p-2 border border-zinc-200"
          />
          <h1 className="text-xl font-display font-extrabold text-[#111114] dark:text-white">
            Verifica tu correo electrónico
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Enviamos un enlace de confirmación a <strong>{user.correo}</strong>. Haz clic en el enlace y después presiona continuar.
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void refreshAuthUser()}
              className="alquia-gold-btn w-full py-3 rounded-xl text-sm font-extrabold inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Ya verifiqué mi correo
            </button>
            <button
              type="button"
              onClick={() => void resendVerificationEmail()}
              className="alquia-gold-outline-btn w-full py-2.5 rounded-xl text-xs font-bold"
            >
              Reenviar correo de verificación
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-zinc-500 hover:text-[#C81E1E] inline-flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cambiar cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-[#0B0B0D]">
      {/* Panel Izquierdo: Identidad Mueblería Alquia en Negro, Rojo y Blanco */}
      <div className="lg:col-span-6 alquia-dark-panel text-white p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden border-b-4 lg:border-b-0 lg:border-r-4 border-[#C81E1E]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#EDD06D]">
            Mueblería Alquia · Apaseo el Alto
          </span>
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label="Cambiar tema claro u oscuro"
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#EDD06D] transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="my-10 lg:my-0 flex flex-col items-start gap-6 max-w-md">
          <div className="rounded-3xl bg-white px-7 py-5 shadow-2xl border-2 border-[#D4A329]/70">
            <img
              src="/alquia-ticket-logo.svg"
              alt="Mueblería Alquia"
              className="h-28 sm:h-32 w-auto object-contain"
            />
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight leading-tight">
              Control total de{' '}
              <span className="text-[#EDD06D]">créditos, apartados, caja e inventario</span>
            </h1>
          </div>
        </div>

        <div className="text-xs text-zinc-400">
          © {new Date().getFullYear()} Mueblería Alquia · Apaseo el Alto
        </div>
      </div>

      {/* Panel Derecho: Acceso Personal unificado para Administradores y Cobradores */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-[#0B0B0D]">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#C81E1E] dark:text-red-400">
            <UserCheck className="w-4 h-4" />
            Acceso Personal
          </div>

          <div>
            <h2 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white">
              {mode === 'login'
                ? 'Iniciar sesión en Mueblería Alquia'
                : 'Crear cuenta de acceso'}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              {mode === 'login'
                ? 'Ingresa con tu cuenta autorizada de administrador, cobrador o mostrador.'
                : 'Registra tu correo para acceder al sistema. Tus permisos y tienda se asignan automáticamente a tu cuenta.'}
            </p>
          </div>

          {!isNativeApp && (
            <>
              {/* Botón Acceso con cuenta Google */}
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleGoogle()}
                className="alquia-gold-btn w-full py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2.5 disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                Acceder con cuenta de Google
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-zinc-200 dark:border-zinc-800 w-full" />
                <span className="px-3 text-xs text-zinc-400 bg-white dark:bg-[#0B0B0D] shrink-0">
                  o con correo y contraseña
                </span>
                <div className="border-t border-zinc-200 dark:border-zinc-800 w-full" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="login-nombre"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Nombre completo
                </label>
                <input
                  id="login-nombre"
                  type="text"
                  autoComplete="name"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Laura Martínez"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Contraseña
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3.5 py-2.5 text-xs font-semibold text-[#C81E1E] dark:text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="alquia-gold-btn w-full py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {mode === 'login' ? (
                <>
                  Entrar a Mueblería Alquia
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Crear cuenta
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'login' ? 'register' : 'login'));
                setError(null);
              }}
              className="text-xs font-bold text-[#C81E1E] dark:text-red-400 hover:underline"
            >
              {mode === 'login'
                ? '¿No tienes cuenta? Regístrate aquí'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
