import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CheckCircle2,
  CreditCard,
  FileDown,
  History,
  Lock,
  LockOpen,
  Receipt,
  ShoppingBag,
  Smartphone,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';
import {
  buildAbonoTicketData,
  formatDateTimeMX,
  formatMXN,
  formatShortDate,
  resolveAbonoStoreAttribution,
  summarizeCajaShift,
  todayISODate,
} from '../utils/finance';
import { downloadCorteCajaPDF, downloadFullPageTicketPDF } from '../utils/pdfTicket';

export function CajaView() {
  const {
    user,
    configuracion,
    sucursales,
    currentSucursal,
    activeCajaTurno,
    cajasTurnos,
    ventas,
    creditos,
    apartados,
    abonos,
    abrirCaja,
    cerrarCaja,
    deleteCajaTurno,
    deleteAbono,
    setActiveTicket,
    notify,
  } = useStore();

  const [fondoInicial, setFondoInicial] = useState('500');
  const [opening, setOpening] = useState(false);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [notasCierre, setNotasCierre] = useState('');
  const [closing, setClosing] = useState(false);
  const [deletingAbonoId, setDeletingAbonoId] = useState<string | null>(null);
  const [deletingTurnoId, setDeletingTurnoId] = useState<string | null>(null);
  const [cobradorFilter, setCobradorFilter] = useState<string>('todos');

  const isAdmin = user?.rol === 'admin';
  const today = todayISODate();

  const summary = useMemo(
    () => summarizeCajaShift(activeCajaTurno, ventas, abonos, today),
    [activeCajaTurno, ventas, abonos, today]
  );

  const closedShifts = useMemo(
    () =>
      cajasTurnos.filter((t) => {
        if (t.estado !== 'cerrada') return false;
        if (!isAdmin && user) return t.abiertaPorUid === user.uid;
        return true;
      }),
    [cajasTurnos, isAdmin, user]
  );

  const cobradoresConCortes = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of closedShifts) {
      if (t.abiertaPorUid && !map.has(t.abiertaPorUid)) {
        map.set(t.abiertaPorUid, t.abiertaPorNombre || t.cerradaPorNombre || 'Personal');
      }
    }
    return Array.from(map.entries()).map(([uid, nombre]) => ({ uid, nombre }));
  }, [closedShifts]);

  useEffect(() => {
    if (cobradorFilter !== 'todos' && !cobradoresConCortes.some((c) => c.uid === cobradorFilter)) {
      setCobradorFilter('todos');
    }
  }, [cobradorFilter, cobradoresConCortes]);

  const filteredClosedShifts = useMemo(() => {
    if (!isAdmin || cobradorFilter === 'todos') return closedShifts;
    return closedShifts.filter((t) => t.abiertaPorUid === cobradorFilter);
  }, [closedShifts, isAdmin, cobradorFilter]);

  const handleDeleteClosedShift = async (turnoId: string) => {
    setDeletingTurnoId(turnoId);
    try {
      await deleteCajaTurno(turnoId);
    } catch (err) {
      logAppError({ source: 'operacion', action: 'deleteCajaTurno', error: err, context: { turnoId } });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingTurnoId(null);
    }
  };

  const handleOpenCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(fondoInicial);
    if (!Number.isFinite(monto) || monto < 0) {
      notify('Ingresa un fondo inicial válido ($0 o mayor).', 'error');
      return;
    }
    setOpening(true);
    try {
      await abrirCaja(monto);
      setFondoInicial('500');
    } catch (err) {
      logAppError({ source: 'operacion', action: 'abrirCaja', error: err, context: { monto } });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setOpening(false);
    }
  };

  const handleDeleteAbonoRow = async (abonoId: string) => {
    setDeletingAbonoId(abonoId);
    try {
      await deleteAbono(abonoId);
    } catch (err) {
      logAppError({ source: 'operacion', action: 'deleteAbono', error: err, context: { abonoId } });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingAbonoId(null);
    }
  };

  const handleDownloadPartialPDF = () => {
    if (!activeCajaTurno) return;
    try {
      downloadCorteCajaPDF({
        turno: activeCajaTurno,
        ventas,
        abonos,
        config: configuracion,
        cerradoPorNombre: user?.nombre || activeCajaTurno.abiertaPorNombre,
        sucursal: currentSucursal,
        notasCierre: notasCierre || 'Corte parcial de caja (caja aún abierta).',
      });
      notify('PDF de corte parcial de caja descargado.');
    } catch {
      notify('No se pudo generar el PDF de corte de caja.', 'error');
    }
  };

  const handleConfirmCloseCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCajaTurno) return;
    setClosing(true);
    try {
      // 1) Descargar SIEMPRE el PDF con la venta del día y los abonos ANTES de borrar las ventas del día
      downloadCorteCajaPDF({
        turno: activeCajaTurno,
        ventas,
        abonos,
        config: configuracion,
        cerradoPorNombre: user?.nombre || activeCajaTurno.abiertaPorNombre,
        sucursal: currentSucursal,
        notasCierre,
      });

      // 2) Cerrar el turno y borrar la venta del día
      await cerrarCaja({ notasCierre });
      setCloseModalOpen(false);
      setNotasCierre('');
    } catch (err) {
      logAppError({ source: 'operacion', action: 'cerrarCaja', error: err });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white tracking-tight">
            Mi Caja Personal y Corte
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Caja privada de <strong>{user?.nombre || 'tu usuario'}</strong>: solo contabiliza tus propias ventas y abonos recibidos. Al cerrar descarga el PDF automáticamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {currentSucursal && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300">
              <Store className="w-3.5 h-3.5 text-[#C81E1E]" />
              {currentSucursal.nombre}
            </span>
          )}

          {activeCajaTurno && (
            <>
              <button
                type="button"
                onClick={handleDownloadPartialPDF}
                className="alquia-gold-outline-btn inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold"
              >
                <FileDown className="w-4 h-4" />
                Descargar PDF parcial
              </button>
              <button
                type="button"
                onClick={() => setCloseModalOpen(true)}
                className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
              >
                <Lock className="w-4 h-4" />
                Descargar PDF y Cerrar Caja
              </button>
            </>
          )}
        </div>
      </div>

      {/* Estado de Caja: Cerrada -> Abrir Caja */}
      {!activeCajaTurno ? (
        <section className="rounded-2xl bg-white dark:bg-[#141418] border-2 border-[#C81E1E]/30 p-6 sm:p-8 alquia-card">
          <div className="max-w-xl space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#111114] text-[#EDD06D] flex items-center justify-center shrink-0">
                <LockOpen className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-display font-extrabold text-[#111114] dark:text-white">
                  Tu caja está cerrada · Abrir turno personal
                </h2>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  Cada miembro del personal abre y cierra exclusivamente su propia caja. Ingresa tu fondo inicial en efectivo para registrar tus ventas y abonos del turno.
                </p>
              </div>
            </div>

            <form onSubmit={handleOpenCaja} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="caja-fondo-inicial"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Fondo inicial en efectivo (MXN)
                </label>
                <input
                  id="caja-fondo-inicial"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={fondoInicial}
                  onChange={(e) => setFondoInicial(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-base font-mono-num font-bold focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
                />
              </div>
              <button
                type="submit"
                disabled={opening}
                className="alquia-gold-btn px-6 py-3 rounded-xl text-sm font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <LockOpen className="w-4 h-4" />
                {opening ? 'Abriendo caja...' : 'Abrir Caja'}
              </button>
            </form>
          </div>
        </section>
      ) : (
        <>
          {/* Banner Turno Activo */}
          <div className="rounded-2xl bg-[#111114] text-white border-l-4 border-[#D4A329] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                    Caja Abierta
                  </span>
                  <span className="text-xs text-zinc-400">·</span>
                  <span className="text-xs text-zinc-300">
                    Apertura: {formatDateTimeMX(activeCajaTurno.abiertaEn)}
                  </span>
                </div>
                <div className="text-sm font-bold mt-0.5">
                  Abierta por: {activeCajaTurno.abiertaPorNombre}
                  {activeCajaTurno.encargadoTienda && (
                    <span className="text-zinc-400 font-normal">
                      {' '}
                      · Encargado: {activeCajaTurno.encargadoTienda}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">Fondo inicial</div>
              <div className="text-lg font-mono-num font-extrabold text-[#EDD06D]">
                {formatMXN(activeCajaTurno.fondoInicial)}
              </div>
            </div>
          </div>

          {/* KPIs del Turno */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-4 alquia-card">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                <span>Ventas del día ({summary.ventasDelDia.length})</span>
                <ShoppingBag className="w-4 h-4 text-[#C81E1E]" />
              </div>
              <div className="text-2xl font-display font-extrabold font-mono-num mt-1.5">
                {formatMXN(summary.totalPagosIniciales)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Importe total vendido: {formatMXN(summary.totalVentasImporte)}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-4 alquia-card">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
                <span>Abonos recibidos ({summary.abonosDelDia.length})</span>
                <Receipt className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-display font-extrabold font-mono-num text-emerald-600 dark:text-emerald-400 mt-1.5">
                {formatMXN(summary.totalAbonos)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Créditos y apartados cobrados hoy
              </div>
            </div>

            <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 alquia-card">
              <div className="flex items-center justify-between text-xs font-semibold text-[#C81E1E] dark:text-red-400">
                <span>Total ingresos del día</span>
                <Calculator className="w-4 h-4 text-[#C81E1E]" />
              </div>
              <div className="text-2xl font-display font-extrabold font-mono-num text-[#C81E1E] dark:text-red-400 mt-1.5">
                {formatMXN(summary.totalIngresosDia)}
              </div>
              <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                Ventas cobradas + abonos
              </div>
            </div>

            <div className="rounded-2xl bg-[#111114] text-white border border-zinc-800 p-4 alquia-card">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                <span>Efectivo esperado en caja</span>
                <Banknote className="w-4 h-4 text-[#EDD06D]" />
              </div>
              <div className="text-2xl font-display font-extrabold font-mono-num text-[#EDD06D] mt-1.5">
                {formatMXN(summary.efectivoEsperadoEnCaja)}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Fondo inicial + cobros en efectivo
              </div>
            </div>
          </div>

          {/* Desglose por método de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">
                <Banknote className="w-4 h-4 text-emerald-600" />
                Efectivo cobrado
              </span>
              <span className="font-mono-num font-extrabold text-sm">
                {formatMXN(summary.porMetodo.efectivo)}
              </span>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">
                <CreditCard className="w-4 h-4 text-[#C81E1E]" />
                Tarjeta
              </span>
              <span className="font-mono-num font-extrabold text-sm">
                {formatMXN(summary.porMetodo.tarjeta)}
              </span>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300">
                <Smartphone className="w-4 h-4 text-[#D4A329]" />
                Transferencia
              </span>
              <span className="font-mono-num font-extrabold text-sm">
                {formatMXN(summary.porMetodo.transferencia)}
              </span>
            </div>
          </div>

          {/* Tablas de Ventas del día y Abonos del día */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas del día */}
            <section className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
              <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E] flex items-center justify-between">
                <h2 className="text-sm font-display font-bold flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#EDD06D]" />
                  Ventas del día ({summary.ventasDelDia.length})
                </h2>
                <span className="text-xs font-mono-num font-bold text-[#EDD06D]">
                  {formatMXN(summary.totalPagosIniciales)}
                </span>
              </div>

              {summary.ventasDelDia.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No hay ventas registradas en este turno todavía.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 uppercase text-[10.5px] border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5">Folio</th>
                        <th className="px-4 py-2.5">Cliente</th>
                        <th className="px-4 py-2.5">Tipo / Pago</th>
                        <th className="px-4 py-2.5 text-right">Cobrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {summary.ventasDelDia.map((v) => (
                        <tr key={v.id}>
                          <td className="px-4 py-2.5 font-mono font-bold text-[#C81E1E] dark:text-red-400">
                            {v.folio}
                          </td>
                          <td className="px-4 py-2.5 font-semibold">{v.clienteNombre}</td>
                          <td className="px-4 py-2.5 capitalize text-zinc-500">
                            {v.tipo} · {v.metodoPago}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-num font-bold">
                            {formatMXN(v.pagoInicial)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Abonos del día (Nombre del cliente y cuánto abonó) */}
            <section className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
              <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E] flex items-center justify-between">
                <h2 className="text-sm font-display font-bold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#EDD06D]" />
                  Abonos recibidos ({summary.abonosDelDia.length})
                </h2>
                <span className="text-xs font-mono-num font-bold text-emerald-400">
                  {formatMXN(summary.totalAbonos)}
                </span>
              </div>

              {summary.abonosDelDia.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No se han registrado abonos de créditos o apartados en este turno.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 uppercase text-[10.5px] border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-2.5">Folio</th>
                        <th className="px-4 py-2.5">Nombre del cliente</th>
                        <th className="px-4 py-2.5">Cuenta</th>
                        <th className="px-4 py-2.5 text-right">Cuánto abonó</th>
                        <th className="px-4 py-2.5 text-right">Recibo / Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {summary.abonosDelDia.map((ab) => {
                        const linkedCredito =
                          ab.tipoOperacion === 'credito'
                            ? creditos.find((c) => c.id === ab.operacionId)
                            : null;
                        const linkedApartado =
                          ab.tipoOperacion === 'apartado'
                            ? apartados.find((a) => a.id === ab.operacionId)
                            : null;
                        const abonoStore =
                          (ab.sucursalId ? sucursales.find((s) => s.id === ab.sucursalId) : null) ||
                          currentSucursal;
                        const attr = resolveAbonoStoreAttribution({
                          abono: ab,
                          cuentaSucursalId: linkedCredito?.sucursalId || linkedApartado?.sucursalId,
                          sucursales,
                        });
                        const abonoTicket = buildAbonoTicketData({
                          abono: ab,
                          credito: linkedCredito,
                          apartado: linkedApartado,
                          sucursal: abonoStore,
                        });
                        return (
                          <tr key={ab.id}>
                            <td className="px-4 py-2.5 font-mono font-bold">{ab.folio}</td>
                            <td className="px-4 py-2.5">
                              <div className="font-bold text-[#111114] dark:text-white">
                                {ab.clienteNombre}
                              </div>
                              <div className="text-[10.5px] text-zinc-500">
                                Recibió: {ab.cobradorNombre}
                                {attr.enOtraTienda && attr.abonoSucursalNombre
                                  ? ` · Otra tienda (${attr.abonoSucursalNombre})`
                                  : ''}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-500">
                              {ab.operacionFolio} ({ab.tipoOperacion === 'credito' ? 'crédito' : 'apartado'})
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono-num font-extrabold text-emerald-600 dark:text-emerald-400">
                              +{formatMXN(ab.monto)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setActiveTicket(abonoTicket)}
                                  aria-label={`Ver recibo digital de abono ${ab.folio}`}
                                  title="Recibo digital (PDF, WhatsApp, Correo)"
                                  className="p-1.5 rounded-lg alquia-gold-outline-btn"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    try {
                                      downloadFullPageTicketPDF(abonoTicket, {
                                        ...configuracion,
                                        sucursalDireccion: abonoStore?.direccion || currentSucursal?.direccion,
                                        encargadoTienda: abonoStore?.encargadoNombre || currentSucursal?.encargadoNombre,
                                      });
                                      notify(`Recibo PDF ${ab.folio} descargado.`);
                                    } catch (err) {
                                      logAppError({
                                        source: 'operacion',
                                        action: 'downloadAbonoCajaPDF',
                                        error: err,
                                        context: { folio: ab.folio },
                                      });
                                      notify(formatFriendlyErrorMessage(err), 'error');
                                    }
                                  }}
                                  aria-label={`Descargar PDF de abono ${ab.folio}`}
                                  title="Descargar recibo PDF"
                                  className="p-1.5 rounded-lg alquia-gold-btn"
                                >
                                  <FileDown className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    disabled={deletingAbonoId === ab.id}
                                    onClick={() => void handleDeleteAbonoRow(ab.id)}
                                    aria-label={`Eliminar abono ${ab.folio}`}
                                    title="Eliminar abono (solo Admin)"
                                    className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[#C81E1E] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* Historial de Cortes de Caja Cerrados (Propio para cobradores; auditable por cobrador para Admin) */}
      <section className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#C81E1E]" />
            <div>
              <h2 className="text-sm font-display font-bold">
                {isAdmin
                  ? `Historial de cortes de caja cerrados (${filteredClosedShifts.length})`
                  : `Mi historial de cortes de caja cerrados (${filteredClosedShifts.length})`}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {isAdmin
                  ? 'Como Administrador puedes consultar los cortes de caja de cada cobrador y eliminar registros si es necesario.'
                  : 'Aquí solo aparecen tus propios cierres de caja personales.'}
              </p>
            </div>
          </div>

          {isAdmin && cobradoresConCortes.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="caja-cobrador-filter"
                className="text-xs font-bold text-zinc-600 dark:text-zinc-400"
              >
                Cobrador:
              </label>
              <select
                id="caja-cobrador-filter"
                value={cobradorFilter}
                onChange={(e) => setCobradorFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-bold"
              >
                <option value="todos">Todos los cobradores ({closedShifts.length})</option>
                {cobradoresConCortes.map((c) => (
                  <option key={c.uid} value={c.uid}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {filteredClosedShifts.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            Aún no hay cierres de caja registrados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 uppercase text-[10.5px] border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Fecha cierre</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Cobrador / Personal</th>
                  <th className="px-4 py-3 text-right">Ventas día</th>
                  <th className="px-4 py-3 text-right">Abonos día</th>
                  <th className="px-4 py-3 text-right">Ventas limpiadas</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredClosedShifts.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatShortDate(t.cerradaEn || t.abiertaEn)}
                    </td>
                    <td className="px-4 py-3 font-semibold">{t.sucursalNombre || 'Tienda Principal'}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">
                      {t.cerradaPorNombre || t.abiertaPorNombre}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold">
                      {formatMXN(t.totalVentasDia || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold text-emerald-600">
                      {formatMXN(t.totalAbonosDia || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num">
                      {t.cantidadVentasBorradas ?? 0}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={deletingTurnoId === t.id}
                          onClick={() => void handleDeleteClosedShift(t.id)}
                          aria-label={`Eliminar corte de caja de ${t.cerradaPorNombre || t.abiertaPorNombre}`}
                          title="Eliminar corte de caja (solo Admin)"
                          className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[#C81E1E] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Confirmar Cierre de Caja + Descarga Automática de PDF */}
      {closeModalOpen && activeCajaTurno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cierre de caja"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h2 className="text-base font-display font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#EDD06D]" />
                  Cerrar Caja y Descargar Corte PDF
                </h2>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Primero se descargará el PDF con la venta del día y todos los abonos por cliente
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloseModalOpen(false)}
                aria-label="Cancelar cierre de caja"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCloseCaja} className="p-6 space-y-4">
              <div className="rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900 p-4 text-xs space-y-1.5">
                <div className="font-extrabold text-[#C81E1E] dark:text-red-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Al confirmar el cierre de caja:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-zinc-700 dark:text-zinc-300">
                  <li>
                    Se descargará automáticamente el <strong>PDF del Corte de Caja</strong> con{' '}
                    <strong>{summary.ventasDelDia.length} venta(s)</strong> y{' '}
                    <strong>{summary.abonosDelDia.length} abono(s)</strong> (con nombre del cliente y monto abonado).
                  </li>
                  <li>
                    Se borrarán las ventas del día para iniciar el siguiente turno en ceros (los saldos de créditos, apartados e historial de abonos se conservan intactos).
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500">Ingresos del día</span>
                  <div className="font-mono-num font-extrabold text-base mt-0.5">
                    {formatMXN(summary.totalIngresosDia)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500">Efectivo esperado</span>
                  <div className="font-mono-num font-extrabold text-base text-[#C81E1E] mt-0.5">
                    {formatMXN(summary.efectivoEsperadoEnCaja)}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="caja-notas-cierre"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  Observaciones de cierre (opcional)
                </label>
                <textarea
                  id="caja-notas-cierre"
                  rows={2}
                  value={notasCierre}
                  onChange={(e) => setNotasCierre(e.target.value)}
                  placeholder="Ej. Efectivo verificado y entregado completo al encargado."
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCloseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={closing}
                  className="alquia-gold-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold disabled:opacity-60"
                >
                  <FileDown className="w-4 h-4" />
                  {closing ? 'Cerrando caja...' : 'Descargar PDF y Cerrar Caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
