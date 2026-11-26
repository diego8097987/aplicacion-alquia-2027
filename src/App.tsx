import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Calculator,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { StoreProvider, useStore } from './context/StoreContext';
import type { NavTab } from './types/pos';
import { AlquiaLogo } from './components/AlquiaLogo';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { CajaView } from './components/CajaView';
import { PosView } from './components/PosView';
import { ClientesView } from './components/ClientesView';
import { CreditosView } from './components/CreditosView';
import { ApartadosView } from './components/ApartadosView';
import { ProductosView } from './components/ProductosView';
import { InventarioView } from './components/InventarioView';
import { ProveedoresView } from './components/ProveedoresView';
import { ConfigDeployView } from './components/ConfigDeployView';
import { TicketModal } from './components/TicketModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  getCreditHealth,
  getLayawayHealth,
  getProductStoreAvailability,
  todayISODate,
} from './utils/finance';

const ALL_NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}> = [
  { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
  { id: 'caja', label: 'Caja del Día', icon: Calculator },
  { id: 'pos', label: 'Punto de Venta', icon: ShoppingCart },
  { id: 'creditos', label: 'Créditos y Cobranza', icon: CreditCard },
  { id: 'apartados', label: 'Apartados', icon: CalendarClock },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'productos', label: 'Productos', icon: Package },
  { id: 'inventario', label: 'Inventario', icon: Boxes },
  { id: 'proveedores', label: 'Proveedores', icon: Truck },
  { id: 'configuracion', label: 'Configuración', icon: Settings, adminOnly: true },
];

function AppShell() {
  const {
    user,
    authReady,
    darkMode,
    toggleDarkMode,
    logout,
    toast,
    creditos,
    apartados,
    productos,
    inventarioSucursales,
    sucursales,
    activeSucursalId,
    currentSucursal,
    activeCajaTurno,
  } = useStore();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedCreditoId, setSelectedCreditoId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = user?.rol === 'admin';
  const today = todayISODate();

  const visibleNavItems = useMemo(
    () => ALL_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  // Si un cobrador estuviera en configuracion, regresar a dashboard
  useEffect(() => {
    if (!isAdmin && activeTab === 'configuracion') {
      setActiveTab('dashboard');
    }
  }, [isAdmin, activeTab]);

  const badges = useMemo(() => {
    const overdueCredits = creditos.filter(
      (c) => c.estado === 'activo' && getCreditHealth(c, today).health === 'vencido'
    ).length;
    const overdueApartados = apartados.filter(
      (a) => a.estado === 'vigente' && getLayawayHealth(a, today).health === 'vencido'
    ).length;
    const activeLayaways = apartados.filter((a) => a.estado === 'vigente').length;
    const lowStock = productos.filter((p) => {
      if (!p.activo) return false;
      const avail = getProductStoreAvailability({
        producto: p,
        inventarioSucursales,
        sucursales,
        currentSucursalId: activeSucursalId,
      });
      return avail.ownStockDisponible <= avail.ownStockMinimo;
    }).length;
    return {
      creditos: overdueCredits,
      apartados: activeLayaways,
      inventario: lowStock,
      configuracion: overdueCredits + overdueApartados,
    };
  }, [creditos, apartados, productos, inventarioSucursales, sucursales, activeSucursalId, today]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0B0B0D]">
        <div className="flex flex-col items-center gap-3">
          <AlquiaLogo />
          <div className="text-xs font-semibold text-zinc-500 animate-pulse">
            Iniciando Mueblería Alquia...
          </div>
        </div>
      </div>
    );
  }

  if (!user || (user.modo === 'firebase' && !user.emailVerified)) {
    return <LoginView />;
  }

  const handleNavigate = (tab: NavTab) => {
    if (tab === 'configuracion' && !isAdmin) return;
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[#F7F7F8] dark:bg-[#0B0B0D] text-[#111114] dark:text-[#FAFAFA]">
      {/* Desktop Sidebar — Negro Obsidiana + Rojo Carmesí + Botón Dorado */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#111114] text-white border-r border-zinc-800 z-30">
        <div className="p-5 border-b border-zinc-800/90">
          <AlquiaLogo inverted />
        </div>

        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => handleNavigate('pos')}
            className="alquia-gold-btn w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-extrabold"
          >
            <Plus className="w-4 h-4" />
            Nueva venta / operación
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navegación principal">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const badge =
              item.id === 'creditos'
                ? badges.creditos
                : item.id === 'apartados'
                  ? badges.apartados
                  : item.id === 'inventario'
                    ? badges.inventario
                    : item.id === 'configuracion'
                      ? badges.configuracion
                      : 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#C81E1E] text-white shadow-md'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'caja' ? (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                      activeCajaTurno
                        ? 'bg-emerald-500 text-black'
                        : 'bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    {activeCajaTurno ? 'Abierta' : 'Cerrada'}
                  </span>
                ) : badge > 0 ? (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono-num ${
                      active
                        ? 'bg-white text-[#C81E1E]'
                        : item.id === 'creditos' || item.id === 'configuracion'
                          ? 'bg-[#C81E1E] text-white'
                          : 'bg-[#D4A329] text-[#111114]'
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">{user.nombre}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0 ${
                    isAdmin ? 'bg-[#C81E1E] text-white' : 'bg-[#D4A329] text-[#111114]'
                  }`}
                >
                  {isAdmin ? 'Admin' : 'Cobrador'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                <Store className="w-3 h-3 shrink-0 text-[#EDD06D]" />
                {currentSucursal?.nombre || 'Tienda Principal'}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-2 rounded-xl bg-white/10 text-[#EDD06D] hover:bg-white/20 transition-colors shrink-0"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[#C81E1E]/25 border border-zinc-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Mobile Header */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
          <AlquiaLogo compact inverted />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Cambiar tema"
              className="p-2 rounded-xl bg-white/10 text-[#EDD06D]"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Abrir menú"
              className="p-2 rounded-xl bg-white/10 text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs">
            <div className="w-72 h-full bg-[#111114] text-white p-5 flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <AlquiaLogo inverted />
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Cerrar menú"
                    className="p-1.5 rounded-lg hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-1">
                  {visibleNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavigate(item.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                          active ? 'bg-[#C81E1E] text-white' : 'text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-[#C81E1E]"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        )}

        {/* Active View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigate}
              onSelectCredito={(creditoId) => {
                setSelectedCreditoId(creditoId);
                handleNavigate('creditos');
              }}
            />
          )}
          {activeTab === 'caja' && <CajaView />}
          {activeTab === 'pos' && <PosView onNavigate={handleNavigate} />}
          {activeTab === 'clientes' && <ClientesView />}
          {activeTab === 'creditos' && (
            <CreditosView
              initialSelectedId={selectedCreditoId}
              onClearInitialSelected={() => setSelectedCreditoId(null)}
            />
          )}
          {activeTab === 'apartados' && <ApartadosView />}
          {activeTab === 'productos' && <ProductosView />}
          {activeTab === 'inventario' && <InventarioView />}
          {activeTab === 'proveedores' && <ProveedoresView />}
          {activeTab === 'configuracion' && isAdmin && <ConfigDeployView />}
        </main>

        {/* Mobile Bottom Bar */}
        <nav
          aria-label="Navegación móvil rápida"
          className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-[#111114] text-white border-t border-zinc-800 px-3 py-2 flex items-center justify-around"
        >
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
              activeTab === 'dashboard' ? 'text-[#EDD06D]' : 'text-zinc-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Inicio
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('creditos')}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
              activeTab === 'creditos' ? 'text-[#EDD06D]' : 'text-zinc-400'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            Créditos
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('pos')}
            aria-label="Nueva venta"
            className="alquia-gold-btn -mt-6 w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
          >
            <Plus className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('apartados')}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
              activeTab === 'apartados' ? 'text-[#EDD06D]' : 'text-zinc-400'
            }`}
          >
            <CalendarClock className="w-5 h-5" />
            Apartados
          </button>
          <button
            type="button"
            onClick={() => handleNavigate('caja')}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold ${
              activeTab === 'caja' ? 'text-[#EDD06D]' : 'text-zinc-400'
            }`}
          >
            <Calculator className="w-5 h-5" />
            Caja
          </button>
        </nav>
      </div>

      {/* Global Ticket Modal */}
      <TicketModal />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 lg:bottom-6 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border ${
            toast.type === 'error'
              ? 'bg-[#C81E1E] text-white border-red-900'
              : 'bg-[#111114] text-[#EDD06D] border-[#D4A329]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </ErrorBoundary>
  );
}
