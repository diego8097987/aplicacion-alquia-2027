import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  Calculator,
  CalendarClock,
  CreditCard,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { NavTab } from '../types/pos';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';
import {
  addDaysToISODate,
  buildAbonoTicketData,
  formatMXN,
  formatShortDate,
  getCreditHealth,
  getLayawayHealth,
  getProductStoreAvailability,
  resolveAbonoStoreAttribution,
  roundMXN,
  todayISODate,
} from '../utils/finance';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  onSelectCredito?: (creditoId: string) => void;
}

export function DashboardView({ onNavigate, onSelectCredito }: DashboardViewProps) {
  const {
    user,
    configuracion,
    sucursales,
    inventarioSucursales,
    activeSucursalId,
    currentSucursal,
    activeCajaTurno,
    ventas,
    creditos,
    apartados,
    abonos,
    productos,
    setActiveTicket,
    deleteAbono,
    clearAbonosYCobranzaDelDia,
    notify,
  } = useStore();
  const [activityFilter, setActivityFilter] = useState<'todos' | 'ventas' | 'abonos'>('todos');
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearingCobranza, setClearingCobranza] = useState(false);
  const [deletingAbonoTarget, setDeletingAbonoTarget] = useState<{
    id: string;
    title: string;
    amount: number;
  } | null>(null);
  const [deletingAbono, setDeletingAbono] = useState(false);

  const isAdmin = user?.rol === 'admin';
  const today = todayISODate();
  const weekAgo = addDaysToISODate(today, -7);

  const metrics = useMemo(() => {
    const cobranzaHoy = roundMXN(
      abonos
        .filter((a) => a.creadoEn.slice(0, 10) === today)
        .reduce((acc, a) => acc + a.monto, 0) +
        ventas
          .filter((v) => v.creadoEn.slice(0, 10) === today && v.estado !== 'cancelada')
          .reduce((acc, v) => acc + v.pagoInicial, 0)
    );

    const cobranzaSemana = roundMXN(
      abonos
        .filter((a) => a.creadoEn.slice(0, 10) >= weekAgo)
        .reduce((acc, a) => acc + a.monto, 0) +
        ventas
          .filter((v) => v.creadoEn.slice(0, 10) >= weekAgo && v.estado !== 'cancelada')
          .reduce((acc, v) => acc + v.pagoInicial, 0)
    );

    const ventasTotales = roundMXN(
      ventas.filter((v) => v.estado !== 'cancelada').reduce((acc, v) => acc + v.total, 0)
    );

    const creditosActivos = creditos.filter((c) => c.estado === 'activo');
    const carteraPendiente = roundMXN(creditosActivos.reduce((acc, c) => acc + c.saldoPendiente, 0));
    const totalCreditosMonto = roundMXN(creditos.reduce((acc, c) => acc + c.montoTotal, 0));
    const totalCreditosAbonado = roundMXN(creditos.reduce((acc, c) => acc + c.totalAbonado, 0));
    const porcentajeRecuperado =
      totalCreditosMonto > 0 ? Math.min(100, Math.round((totalCreditosAbonado / totalCreditosMonto) * 100)) : 0;

    let vencidosCount = 0;
    let porVencerCount = 0;
    let alCorrienteCount = 0;

    const alertasCobranza = creditosActivos
      .map((c) => {
        const { health, daysDiff } = getCreditHealth(c, today);
        if (health === 'vencido') vencidosCount += 1;
        else if (health === 'por_vencer') porVencerCount += 1;
        else alCorrienteCount += 1;
        return { credito: c, health, daysDiff };
      })
      .sort((a, b) => a.daysDiff - b.daysDiff);

    const apartadosVigentes = apartados.filter((a) => a.estado === 'vigente');
    const apartadosPorVencer = apartadosVigentes.filter(
      (a) => getLayawayHealth(a, today).health !== 'vigente'
    );

    const stockBajo = productos
      .map((p) => ({
        producto: p,
        avail: getProductStoreAvailability({
          producto: p,
          inventarioSucursales,
          sucursales,
          currentSucursalId: activeSucursalId,
        }),
      }))
      .filter(({ producto: p, avail }) => p.activo && avail.ownStockDisponible <= avail.ownStockMinimo);

    return {
      cobranzaHoy,
      cobranzaSemana,
      ventasTotales,
      creditosActivosCount: creditosActivos.length,
      carteraPendiente,
      totalCreditosMonto,
      totalCreditosAbonado,
      porcentajeRecuperado,
      vencidosCount,
      porVencerCount,
      alCorrienteCount,
      alertasCobranza,
      apartadosVigentesCount: apartadosVigentes.length,
      apartadosPorVencer,
      stockBajo,
    };
  }, [abonos, ventas, creditos, apartados, productos, inventarioSucursales, sucursales, activeSucursalId, today, weekAgo]);

  const activityFeed = useMemo(() => {
    const items: Array<{
      id: string;
      rawId: string;
      kind: 'venta' | 'abono';
      title: string;
      subtitle: string;
      amount: number;
      dateISO: string;
      onOpenTicket: () => void;
    }> = [];

    if (activityFilter === 'todos' || activityFilter === 'ventas') {
      for (const v of ventas.slice(0, 8)) {
        items.push({
          id: `v-${v.id}`,
          rawId: v.id,
          kind: 'venta',
          title: `${v.folio} · ${v.clienteNombre}`,
          subtitle: `${v.tipo.toUpperCase()} · ${formatShortDate(v.creadoEn)} · ${v.metodoPago}`,
          amount: v.total,
          dateISO: v.creadoEn,
          onOpenTicket: () =>
            setActiveTicket({
              tipoDocumento:
                v.tipo === 'contado'
                  ? 'venta_contado'
                  : v.tipo === 'credito'
                    ? 'venta_credito'
                    : 'apartado',
              folio: v.folio,
              referenciaFolio: v.referenciaFolio,
              fechaISO: v.creadoEn,
              clienteNombre: v.clienteNombre,
              clienteTelefono: v.clienteTelefono,
              atendidoPor: v.vendedorNombre,
              sucursalNombre: v.sucursalNombre || currentSucursal?.nombre,
              sucursalDireccion: v.sucursalDireccion || currentSucursal?.direccion,
              encargadoTienda: v.encargadoTienda || currentSucursal?.encargadoNombre,
              metodoPago: v.metodoPago,
              items: v.items,
              subtotal: v.subtotal,
              descuento: v.descuento,
              saldoAFavorAplicado: v.saldoAFavorAplicado,
              montoTotal: v.total,
              pagoRecibido: v.pagoInicial,
              saldoPendiente: roundMXN(Math.max(0, v.total - v.pagoInicial)),
            }),
        });
      }
    }

    if (activityFilter === 'todos' || activityFilter === 'abonos') {
      for (const ab of abonos.slice(0, 8)) {
        const linkedCredito =
          ab.tipoOperacion === 'credito' ? creditos.find((c) => c.id === ab.operacionId) : null;
        const linkedApartado =
          ab.tipoOperacion === 'apartado' ? apartados.find((a) => a.id === ab.operacionId) : null;
        const abonoStore =
          (ab.sucursalId ? sucursales.find((s) => s.id === ab.sucursalId) : null) ||
          currentSucursal;
        const attr = resolveAbonoStoreAttribution({
          abono: ab,
          cuentaSucursalId: linkedCredito?.sucursalId || linkedApartado?.sucursalId,
          sucursales,
        });
        const storeTag = attr.abonoSucursalNombre
          ? attr.enOtraTienda
            ? ` · Otra tienda: ${attr.abonoSucursalNombre}`
            : ` · ${attr.abonoSucursalNombre}`
          : '';
        items.push({
          id: `ab-${ab.id}`,
          rawId: ab.id,
          kind: 'abono',
          title: `Abono ${ab.folio} · ${ab.clienteNombre}`,
          subtitle: `Cuenta ${ab.operacionFolio}${storeTag} · Recibió: ${ab.cobradorNombre || 'Personal'} · ${formatShortDate(ab.creadoEn)} · ${ab.metodoPago}`,
          amount: ab.monto,
          dateISO: ab.creadoEn,
          onOpenTicket: () =>
            setActiveTicket(
              buildAbonoTicketData({
                abono: ab,
                credito: linkedCredito,
                apartado: linkedApartado,
                sucursal: abonoStore,
              })
            ),
        });
      }
    }

    return items.sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1)).slice(0, 7);
  }, [activityFilter, ventas, abonos, creditos, apartados, sucursales, setActiveTicket, currentSucursal]);

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (metrics.porcentajeRecuperado / 100) * circumference;

  const firstName = user?.nombre.split(' ')[0] || 'Equipo';

  const handleClearCobranza = async (scope: 'hoy' | 'todos') => {
    setClearingCobranza(true);
    try {
      await clearAbonosYCobranzaDelDia(scope);
      setClearModalOpen(false);
    } catch (err) {
      logAppError({
        source: 'operacion',
        action: 'clearAbonosYCobranzaDelDia',
        error: err,
        context: { scope },
      });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setClearingCobranza(false);
    }
  };

  const handleConfirmDeleteAbono = async () => {
    if (!deletingAbonoTarget) return;
    setDeletingAbono(true);
    try {
      await deleteAbono(deletingAbonoTarget.id);
      setDeletingAbonoTarget(null);
    } catch (err) {
      logAppError({
        source: 'operacion',
        action: 'deleteAbono',
        error: err,
        context: { abonoId: deletingAbonoTarget.id },
      });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingAbono(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Saludo principal */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-[#111114] dark:text-white">
            Buen día, {firstName}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {configuracion.nombreComercial}
            {currentSucursal?.nombre ? ` · ${currentSucursal.nombre}` : ''} · {formatShortDate(today)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('caja')}
            className="px-4 py-2.5 rounded-xl alquia-gold-outline-btn text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <Calculator className="w-3.5 h-3.5" />
            {activeCajaTurno ? 'Caja abierta' : 'Abrir caja'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('creditos')}
            className="px-4 py-2.5 rounded-xl alquia-gold-outline-btn text-xs font-bold whitespace-nowrap"
          >
            Registrar abono
          </button>
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="px-4 py-2.5 rounded-xl alquia-gold-btn text-xs font-bold whitespace-nowrap"
          >
            Nueva venta POS
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Cobranza del día</span>
            <span className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/50 text-[#C81E1E] dark:text-red-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-3 font-mono font-bold text-2xl text-[#111114] dark:text-white tabular-nums">
            {formatMXN(metrics.cobranzaHoy)}
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
            Semana (7d):{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatMXN(metrics.cobranzaSemana)}
            </span>
          </p>
          {isAdmin &&
            (metrics.cobranzaHoy > 0 ||
              metrics.cobranzaSemana > 0 ||
              abonos.length > 0 ||
              ventas.length > 0) && (
              <button
                type="button"
                onClick={() => setClearModalOpen(true)}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#C81E1E] dark:text-red-400 hover:underline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Borrar abonos y cobranza del día
              </button>
            )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Ventas registradas</span>
            <span className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[#111114] dark:text-white flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-3 font-mono font-bold text-2xl text-[#111114] dark:text-white tabular-nums">
            {formatMXN(metrics.ventasTotales)}
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
            {ventas.filter((v) => v.estado !== 'cancelada').length} operaciones activas/completadas
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Cartera por cobrar</span>
            <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-3 font-mono font-bold text-2xl text-[#111114] dark:text-white tabular-nums">
            {formatMXN(metrics.carteraPendiente)}
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
            {metrics.creditosActivosCount} créditos activos ·{' '}
            <span className={metrics.vencidosCount > 0 ? 'text-[#C81E1E] dark:text-red-400 font-bold' : ''}>
              {metrics.vencidosCount} vencidos
            </span>
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Apartados y Stock</span>
            <span className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/50 text-[#C81E1E] dark:text-red-400 flex items-center justify-center">
              <BookmarkCheck className="w-4 h-4" />
            </span>
          </div>
          <p className="mt-3 font-mono font-bold text-2xl text-[#111114] dark:text-white tabular-nums">
            {metrics.apartadosVigentesCount}{' '}
            <span className="text-sm font-sans font-medium text-neutral-600 dark:text-neutral-400">vigentes</span>
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
            {metrics.stockBajo.length} productos con stock bajo
          </p>
        </div>
      </div>

      {/* Main 12-col Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna izquierda (7 cols): Agenda de cobranza + Actividad reciente */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 alquia-card">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display font-bold text-base text-[#111114] dark:text-white">
                  Cuentas por cobrar prioritarias
                </h2>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                  Pagos vencidos y próximos a vencer (7 días)
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('creditos')}
                className="px-3 py-1.5 rounded-lg alquia-gold-outline-btn text-xs font-bold whitespace-nowrap"
              >
                Ver cartera
              </button>
            </div>

            {metrics.alertasCobranza.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
                No hay créditos activos pendientes de cobro.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {metrics.alertasCobranza.slice(0, 5).map(({ credito, health, daysDiff }) => {
                  const iconStyle =
                    health === 'vencido'
                      ? 'bg-red-50 dark:bg-red-950/60 text-[#C81E1E] dark:text-red-400'
                      : health === 'por_vencer'
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-[#111114] dark:text-white';

                  const statusText =
                    health === 'vencido'
                      ? `Vencido hace ${Math.abs(daysDiff)} día(s)`
                      : health === 'por_vencer'
                        ? daysDiff === 0
                          ? 'Vence hoy'
                          : `Vence en ${daysDiff} día(s)`
                        : `Próximo pago ${formatShortDate(credito.proximaFechaPago)}`;

                  return (
                    <div
                      key={credito.id}
                      className="py-3.5 flex items-center justify-between gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 -mx-2 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconStyle}`}>
                          <CalendarClock className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#111114] dark:text-white truncate">
                            {credito.clienteNombre}
                          </p>
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                            {credito.folio} ·{' '}
                            <span
                              className={
                                health === 'vencido'
                                  ? 'text-[#C81E1E] dark:text-red-400 font-bold'
                                  : health === 'por_vencer'
                                    ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                    : ''
                              }
                            >
                              {statusText}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="font-mono font-bold text-sm text-[#111114] dark:text-white tabular-nums">
                            {formatMXN(credito.montoPago)}
                          </p>
                          <p className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 tabular-nums">
                            Saldo {formatMXN(credito.saldoPendiente)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onSelectCredito ? onSelectCredito(credito.id) : onNavigate('creditos')
                          }
                          className="px-3 py-1.5 rounded-lg alquia-gold-btn text-xs font-bold whitespace-nowrap"
                        >
                          Cobrar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 alquia-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-base text-[#111114] dark:text-white">
                Actividad reciente de mostrador
              </h2>
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800">
                {(['todos', 'ventas', 'abonos'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActivityFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      activityFilter === key
                        ? 'bg-[#C81E1E] text-white shadow-xs'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-[#111114] dark:hover:text-white'
                    }`}
                  >
                    {key === 'todos' ? 'Todos' : key === 'ventas' ? 'Ventas' : 'Abonos'}
                  </button>
                ))}
              </div>
            </div>

            {activityFeed.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
                Aún no hay movimientos registrados en esta categoría.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 -mx-2 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          item.kind === 'abono'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-50 dark:bg-red-950/50 text-[#C81E1E] dark:text-red-400'
                        }`}
                      >
                        {item.kind === 'abono' ? <Receipt className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#111114] dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">{item.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`font-mono font-bold text-sm tabular-nums ${
                          item.kind === 'abono'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-[#C81E1E] dark:text-red-400'
                        }`}
                      >
                        +{formatMXN(item.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={item.onOpenTicket}
                        aria-label={`Ver ticket de ${item.title}`}
                        className="p-2 rounded-lg alquia-gold-outline-btn"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                      {isAdmin && item.kind === 'abono' && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeletingAbonoTarget({
                              id: item.rawId,
                              title: item.title,
                              amount: item.amount,
                            })
                          }
                          aria-label={`Eliminar ${item.title}`}
                          title="Eliminar abono (solo Admin)"
                          className="p-2 rounded-lg border border-red-200 dark:border-red-900 text-[#C81E1E] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Columna derecha (5 cols): Anillo de recuperación + Mostrador rápido + Alertas stock */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-6 alquia-card">
            <h2 className="font-display font-bold text-base text-[#111114] dark:text-white">
              Recuperación de cartera de créditos
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Avance cobrado vs. monto total colocado
            </p>

            <div className="my-5 flex flex-col items-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140" aria-hidden="true">
                  <defs>
                    <linearGradient id="alquiaRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#C81E1E" />
                      <stop offset="100%" stopColor="#D4A329" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    className="text-neutral-200 dark:text-neutral-800"
                    strokeWidth="11"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="url(#alquiaRingGrad)"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono font-bold text-2xl text-[#111114] dark:text-white tabular-nums">
                    {metrics.porcentajeRecuperado}%
                  </span>
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-400">cobrado</span>
                </div>
              </div>

              <div className="mt-4 w-full grid grid-cols-3 gap-2 text-center pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <div>
                  <p className="font-mono font-bold text-base text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {metrics.alCorrienteCount}
                  </p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">Al corriente</p>
                </div>
                <div>
                  <p className="font-mono font-bold text-base text-amber-700 dark:text-amber-400 tabular-nums">
                    {metrics.porVencerCount}
                  </p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">Por vencer</p>
                </div>
                <div>
                  <p className="font-mono font-bold text-base text-[#C81E1E] dark:text-red-400 tabular-nums">
                    {metrics.vencidosCount}
                  </p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">Vencidos</p>
                </div>
              </div>

              {metrics.vencidosCount > 0 && user?.rol === 'admin' && (
                <button
                  type="button"
                  onClick={() => onNavigate('configuracion')}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl alquia-gold-btn text-xs font-bold"
                >
                  <Settings className="w-4 h-4" />
                  Gestionar cuentas vencidas y alertas
                </button>
              )}
            </div>
          </section>

          {/* Tarjeta Banner Negro + Rojo con botón Dorado */}
          <section className="rounded-2xl alquia-dark-panel text-white p-6 relative overflow-hidden border border-neutral-800">
            <div
              className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full bg-[#C81E1E]/35 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative z-10 flex items-end justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Mostrador rápido</p>
                <h3 className="font-display font-bold text-lg leading-snug">
                  Registra ventas de contado, crédito o apartado en segundos.
                </h3>
                <p className="text-xs text-neutral-300">
                  Descarga tu comprobante en PDF hoja completa o envíalo directo al WhatsApp del cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('pos')}
                aria-label="Ir al Punto de Venta"
                className="w-11 h-11 rounded-full alquia-gold-btn flex items-center justify-center shrink-0"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </section>

          {/* Alertas de Stock Bajo */}
          <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#C81E1E]" />
                <h2 className="font-display font-bold text-sm text-[#111114] dark:text-white">
                  Alertas de stock bajo en tu tienda ({metrics.stockBajo.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('inventario')}
                className="px-2.5 py-1 rounded-lg alquia-gold-outline-btn text-xs font-bold"
              >
                Ver inventario
              </button>
            </div>

            {metrics.stockBajo.length === 0 ? (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 py-3">
                Todo el catálogo cuenta con existencias por encima del mínimo en tu tienda.
              </p>
            ) : (
              <div className="space-y-2.5">
                {metrics.stockBajo.slice(0, 4).map(({ producto: prod, avail }) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-neutral-100 dark:border-neutral-800"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/60 text-[#C81E1E] dark:text-red-400 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#111114] dark:text-white truncate">
                          {prod.nombre}
                        </p>
                        <p className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 truncate">
                          {prod.sku} · {avail.statusMessage}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-xs text-[#C81E1E] dark:text-red-400 tabular-nums shrink-0">
                      {avail.ownStockDisponible} aquí
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal Admin: Borrar abonos y reiniciar Cobranza del día */}
      {clearModalOpen && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Borrar abonos y cobranza del día"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#EDD06D]" />
                <h2 className="text-sm font-display font-bold">Borrar Abonos y Cobranza del día</h2>
              </div>
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                aria-label="Cerrar modal"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Actualmente hay <strong>{abonos.length} abono(s)</strong> y{' '}
                <strong>{ventas.length} venta(s)</strong> registrados en la base de datos. Esta
                acción reinicia <strong>Cobranza del día</strong> a <strong>$0.00</strong> sin
                borrar tus clientes, productos ni créditos o apartados activos.
              </p>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={clearingCobranza}
                  onClick={() => void handleClearCobranza('todos')}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#C81E1E] hover:bg-[#991B1B] text-white font-extrabold text-xs disabled:opacity-60 transition-colors"
                >
                  {clearingCobranza
                    ? 'Borrando...'
                    : 'Borrar TODOS los abonos y reiniciar Cobranza ($0.00)'}
                </button>
                <button
                  type="button"
                  disabled={clearingCobranza}
                  onClick={() => void handleClearCobranza('hoy')}
                  className="w-full py-2.5 px-4 rounded-xl alquia-gold-outline-btn font-bold text-xs disabled:opacity-60"
                >
                  Borrar solo abonos y cobranza de hoy ({formatShortDate(today)})
                </button>
                <button
                  type="button"
                  disabled={clearingCobranza}
                  onClick={() => setClearModalOpen(false)}
                  className="w-full py-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-semibold text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Admin: Eliminar abono individual */}
      {deletingAbonoTarget && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar abono"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E] flex items-center justify-between">
              <h2 className="text-sm font-display font-bold">Eliminar abono</h2>
              <button
                type="button"
                onClick={() => setDeletingAbonoTarget(null)}
                aria-label="Cerrar modal"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-zinc-600 dark:text-zinc-300">
                ¿Deseas eliminar permanentemente <strong>{deletingAbonoTarget.title}</strong> por{' '}
                <strong>{formatMXN(deletingAbonoTarget.amount)}</strong>?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingAbonoTarget(null)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingAbono}
                  onClick={() => void handleConfirmDeleteAbono()}
                  className="px-4 py-2 rounded-xl bg-[#C81E1E] hover:bg-[#991B1B] text-white font-extrabold disabled:opacity-60"
                >
                  {deletingAbono ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
