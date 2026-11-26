import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileDown,
  Mail,
  MessageCircle,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Apartado, MetodoPago, ResolucionCancelacion, TicketData } from '../types/pos';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';
import {
  addDaysToISODate,
  buildAbonoTicketData,
  buildOverdueAlertEmail,
  buildWhatsAppLink,
  buildWhatsAppTicketText,
  formatMXN,
  formatShortDate,
  getLayawayHealth,
  getProductStoreAvailability,
  resolveAbonoStoreAttribution,
  todayISODate,
} from '../utils/finance';
import { downloadFullPageTicketPDF } from '../utils/pdfTicket';

interface PendingLayawayNextDate {
  apartadoId: string;
  folio: string;
  clienteNombre: string;
  suggestedDate: string;
  ticket: TicketData;
  wasLate: boolean;
  diasAtraso: number;
  montoAPagar: number;
}

export function ApartadosView() {
  const {
    user,
    apartados,
    abonos,
    clientes,
    productos,
    sucursales,
    inventarioSucursales,
    activeSucursalId,
    currentSucursal,
    configuracion,
    addCliente,
    crearApartadoDirecto,
    deleteApartado,
    registrarAbonoApartado,
    actualizarProximaFechaPago,
    aumentarPagoUsuarioAtrasado,
    registrarAlertaEnviada,
    cancelarApartado,
    setActiveTicket,
    notify,
  } = useStore();
  const isAdmin = user?.rol === 'admin';

  const [filter, setFilter] = useState<'todos' | 'vigentes' | 'vencidos' | 'liquidados' | 'cancelados'>('todos');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Abono form
  const [montoAbono, setMontoAbono] = useState('');
  const [metodoAbono, setMetodoAbono] = useState<MetodoPago>('efectivo');
  const [notasAbono, setNotasAbono] = useState('');
  const [submittingAbono, setSubmittingAbono] = useState(false);

  // Modal post-abono: pedir fecha de próximo pago
  const [nextDatePrompt, setNextDatePrompt] = useState<PendingLayawayNextDate | null>(null);
  const [confirmedNextDate, setConfirmedNextDate] = useState('');
  const [updateLimitToo, setUpdateLimitToo] = useState(false);
  const [savingNextDate, setSavingNextDate] = useState(false);

  // Modal: Cancelación
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [resolucion, setResolucion] = useState<Exclude<ResolucionCancelacion, 'ninguna'>>('saldo_a_favor');
  const [penalizacion, setPenalizacion] = useState('0');
  const [motivoCancel, setMotivoCancel] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Modal: Nuevo cliente / nuevo apartado
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [clientMode, setClientMode] = useState<'nuevo' | 'existente'>('nuevo');
  const [existingClientId, setExistingClientId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoWhatsApp, setNuevoWhatsApp] = useState('');
  const [nuevaDireccion, setNuevaDireccion] = useState('');
  const [nuevasReferencias, setNuevasReferencias] = useState('');

  const [selectedProdId, setSelectedProdId] = useState('');
  const [descripcionItem, setDescripcionItem] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [anticipoInicial, setAnticipoInicial] = useState('');
  const [metodoAnticipo, setMetodoAnticipo] = useState<MetodoPago>('efectivo');
  const [fechaLimite, setFechaLimite] = useState(() => addDaysToISODate(todayISODate(), 30));
  const [proximoPago, setProximoPago] = useState(() => addDaysToISODate(todayISODate(), 15));
  const [condiciones, setCondiciones] = useState('Mercancía apartada hasta liquidación total.');
  const [submittingNew, setSubmittingNew] = useState(false);

  // Admin: Aumentar pago atrasado & Eliminar apartado
  const [increaseModalOpen, setIncreaseModalOpen] = useState(false);
  const [incSaldo, setIncSaldo] = useState('150');
  const [incMotivo, setIncMotivo] = useState('Recargo por atraso en apartado');
  const [submittingInc, setSubmittingInc] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingApartado, setDeletingApartado] = useState(false);

  const today = todayISODate();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apartados.filter((a) => {
      const { health } = getLayawayHealth(a, today);
      if (filter === 'vigentes' && a.estado !== 'vigente') return false;
      if (filter === 'vencidos' && health !== 'vencido') return false;
      if (filter === 'liquidados' && a.estado !== 'liquidado') return false;
      if (filter === 'cancelados' && a.estado !== 'cancelado') return false;
      if (!q) return true;
      return (
        a.clienteNombre.toLowerCase().includes(q) ||
        a.folio.toLowerCase().includes(q) ||
        a.clienteTelefono.includes(q)
      );
    });
  }, [apartados, filter, search, today]);

  const selected: Apartado | null =
    apartados.find((a) => a.id === selectedId) || filtered[0] || null;

  const selectedAbonos = useMemo(
    () =>
      selected
        ? abonos.filter((a) => a.tipoOperacion === 'apartado' && a.operacionId === selected.id)
        : [],
    [abonos, selected]
  );

  const selectedPunctuality = useMemo(() => {
    let alDia = 0;
    let atrasados = 0;
    selectedAbonos.forEach((ab) => {
      if (ab.estadoPuntualidad === 'atrasado') atrasados += 1;
      else alDia += 1;
    });
    return { alDia, atrasados };
  }, [selectedAbonos]);

  const overdueApartados = useMemo(
    () =>
      apartados.filter(
        (a) => a.estado === 'vigente' && getLayawayHealth(a, today).health === 'vencido'
      ),
    [apartados, today]
  );

  const openNewModal = () => {
    setClientMode('nuevo');
    setExistingClientId(clientes[0]?.id || '');
    setNuevoNombre('');
    setNuevoWhatsApp('');
    setNuevaDireccion('');
    setNuevasReferencias('');
    setSelectedProdId('');
    setDescripcionItem('');
    setMontoTotal('');
    setAnticipoInicial('');
    setFechaLimite(addDaysToISODate(todayISODate(), 30));
    setProximoPago(addDaysToISODate(todayISODate(), 15));
    setCondiciones('Mercancía apartada hasta liquidación total.');
    setNewModalOpen(true);
  };

  const handleCreateApartado = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingNew(true);
    try {
      let clienteId = existingClientId;
      if (clientMode === 'nuevo') {
        const cleanDigits = nuevoWhatsApp.replace(/\D/g, '');
        if (cleanDigits.length < 10) {
          throw new Error('Ingresa un número de WhatsApp válido de al menos 10 dígitos.');
        }
        const created = await addCliente({
          nombre: nuevoNombre,
          telefono: nuevoWhatsApp,
          direccion: nuevaDireccion,
          referencias: nuevasReferencias,
        });
        clienteId = created.id;
      } else if (!clienteId) {
        throw new Error('Selecciona un cliente existente o registra uno nuevo.');
      }

      await crearApartadoDirecto({
        clienteId,
        productoId: selectedProdId || undefined,
        cantidad: 1,
        descripcion: descripcionItem,
        montoTotal: Number(montoTotal),
        anticipoInicial: Number(anticipoInicial),
        metodoPago: metodoAnticipo,
        fechaLimite,
        proximoPagoFecha: proximoPago,
        condiciones,
      });

      setNewModalOpen(false);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleConfirmAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const monto = Number(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      notify('Ingresa un monto válido mayor a $0.', 'error');
      return;
    }
    setSubmittingAbono(true);
    try {
      const res = await registrarAbonoApartado({
        apartadoId: selected.id,
        monto,
        metodoPago: metodoAbono,
        notas: notasAbono,
        deferTicket: true,
      });
      setMontoAbono('');
      setNotasAbono('');

      if (!res.liquidado) {
        setConfirmedNextDate(res.suggestedNextDate);
        setUpdateLimitToo(false);
        setNextDatePrompt({
          apartadoId: selected.id,
          folio: selected.folio,
          clienteNombre: selected.clienteNombre,
          suggestedDate: res.suggestedNextDate,
          ticket: res.ticket,
          wasLate: Boolean(res.overdueAlert),
          diasAtraso: res.overdueAlert?.diasAtraso || 0,
          montoAPagar: res.overdueAlert?.montoAPagar || res.ticket.saldoPendiente,
        });
      }
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingAbono(false);
    }
  };

  const handleSaveNextDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextDatePrompt) return;
    setSavingNextDate(true);
    try {
      await actualizarProximaFechaPago({
        tipo: 'apartado',
        operacionId: nextDatePrompt.apartadoId,
        nuevaFecha: confirmedNextDate,
        actualizarFechaLimite: updateLimitToo,
      });
      setActiveTicket({
        ...nextDatePrompt.ticket,
        proximoPagoFecha: confirmedNextDate,
        ...(updateLimitToo ? { fechaLimite: confirmedNextDate } : {}),
      });
      setNextDatePrompt(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingNextDate(false);
    }
  };

  const handleCancelApartado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmittingCancel(true);
    try {
      await cancelarApartado({
        apartadoId: selected.id,
        resolucion,
        montoPenalizacion: resolucion === 'penalizacion' ? Number(penalizacion) || 0 : 0,
        motivo: motivoCancel,
      });
      setCancelModalOpen(false);
      setMotivoCancel('');
      setPenalizacion('0');
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const handleIncreasePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !isAdmin) return;
    setSubmittingInc(true);
    try {
      await aumentarPagoUsuarioAtrasado({
        tipo: 'apartado',
        operacionId: selected.id,
        incrementoSaldo: Number(incSaldo) || 0,
        motivo: incMotivo,
      });
      setIncreaseModalOpen(false);
      setIncSaldo('150');
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingInc(false);
    }
  };

  const handleDeleteApartado = async () => {
    if (!selected || !isAdmin) return;
    setDeletingApartado(true);
    try {
      await deleteApartado(selected.id);
      setDeleteConfirmOpen(false);
      setSelectedId(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingApartado(false);
    }
  };

  const selectedHealth = selected ? getLayawayHealth(selected, today) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white tracking-tight">
            Apartados de Mercancía
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Agrega clientes con WhatsApp, controla anticipos y abonos progresivos, define el próximo pago y liquida o cancela con control de stock.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente / apartado
        </button>
      </div>

      {overdueApartados.length > 0 && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/35 border border-red-300 dark:border-red-900 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 text-xs">
            <AlertTriangle className="w-5 h-5 text-[#C81E1E] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[#C81E1E] dark:text-red-300">
                {overdueApartados.length} apartado(s) vencidos o con pago atrasado
              </div>
              <div className="text-zinc-700 dark:text-zinc-300 mt-0.5">
                {overdueApartados
                  .slice(0, 3)
                  .map((a) => `${a.clienteNombre} (${formatMXN(a.saldoPendiente)})`)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
            Correo alertas: <strong>{configuracion.correoAlertas}</strong>
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'todos', label: `Todos (${apartados.length})` },
              { id: 'vigentes', label: 'Vigentes' },
              { id: 'vencidos', label: `Vencidos (${overdueApartados.length})` },
              { id: 'liquidados', label: 'Liquidados' },
              { id: 'cancelados', label: 'Cancelados' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                filter === f.id
                  ? f.id === 'vencidos'
                    ? 'bg-[#C81E1E] text-white'
                    : 'bg-[#111114] text-white dark:bg-white dark:text-[#111114]'
                  : 'bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, folio o WhatsApp..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-12 text-center alquia-card space-y-3">
          <CalendarClock className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700" />
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            No hay apartados registrados en esta vista.
          </p>
          <button
            type="button"
            onClick={openNewModal}
            className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
          >
            <UserPlus className="w-4 h-4" />
            Crear primer apartado
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lista */}
          <div className="lg:col-span-5 space-y-3">
            {filtered.map((a) => {
              const { health, daysLeft } = getLayawayHealth(a, today);
              const isSelected = selected?.id === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(a.id);
                    setMontoAbono('');
                  }}
                  className={`w-full text-left rounded-2xl p-4 border transition-all alquia-card ${
                    isSelected
                      ? 'bg-[#111114] text-white border-[#D4A329] ring-2 ring-[#D4A329]/40'
                      : 'bg-white dark:bg-[#141418] border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                          isSelected ? 'bg-[#C81E1E] text-white' : 'bg-zinc-100 dark:bg-zinc-800'
                        }`}
                      >
                        {a.folio}
                      </span>
                      <div className="font-display font-bold text-sm mt-1">{a.clienteNombre}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">
                        Límite: {formatShortDate(a.fechaLimite)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-mono-num font-extrabold text-sm ${
                          isSelected ? 'text-[#EDD06D]' : 'text-[#C81E1E] dark:text-red-400'
                        }`}
                      >
                        {formatMXN(a.saldoPendiente)}
                      </div>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          health === 'vencido'
                            ? 'bg-[#C81E1E] text-white'
                            : health === 'liquidado'
                              ? 'bg-emerald-600 text-white'
                              : health === 'cancelado'
                                ? 'bg-zinc-500 text-white'
                                : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {health === 'vencido'
                          ? `Atrasado ${Math.abs(daysLeft)}d`
                          : health === 'liquidado'
                            ? 'Liquidado'
                            : health === 'cancelado'
                              ? 'Cancelado'
                              : `Quedan ${daysLeft}d`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle */}
          {selected && selectedHealth && (
            <div className="lg:col-span-7">
              <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 alquia-card space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-[#111114] text-white">
                        {selected.folio}
                      </span>
                      <span className="text-xs text-zinc-500 uppercase font-bold">
                        {selected.estado}
                      </span>
                    </div>
                    <h2 className="text-xl font-display font-extrabold mt-1">
                      {selected.clienteNombre}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {selected.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={buildWhatsAppLink(
                        selected.clienteTelefono,
                        buildWhatsAppTicketText(
                          {
                            tipoDocumento: 'apartado',
                            folio: selected.folio,
                            referenciaFolio: selected.folio,
                            fechaISO: new Date().toISOString(),
                            clienteNombre: selected.clienteNombre,
                            clienteTelefono: selected.clienteTelefono,
                            atendidoPor: user?.nombre || 'Mostrador',
                            sucursalNombre: currentSucursal?.nombre,
                            sucursalDireccion: currentSucursal?.direccion,
                            encargadoTienda: currentSucursal?.encargadoNombre,
                            metodoPago: 'efectivo',
                            items: selected.items,
                            montoTotal: selected.montoTotal,
                            saldoAnterior: selected.montoTotal,
                            pagoRecibido: selected.totalAbonado,
                            saldoPendiente: selected.saldoPendiente,
                            proximoPagoFecha:
                              selected.saldoPendiente > 0
                                ? selected.proximoPagoFecha || selected.fechaLimite
                                : undefined,
                            fechaLimite:
                              selected.saldoPendiente > 0 ? selected.fechaLimite : undefined,
                            estadoPuntualidad:
                              selectedHealth.health === 'vencido' ? 'atrasado' : 'al_dia',
                            diasAtraso:
                              selectedHealth.health === 'vencido'
                                ? Math.abs(selectedHealth.daysLeft)
                                : 0,
                          },
                          {
                            ...configuracion,
                            sucursalDireccion: currentSucursal?.direccion,
                            encargadoTienda: currentSucursal?.encargadoNombre,
                          }
                        )
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="alquia-gold-outline-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                    {isAdmin && selected.estado === 'vigente' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIncSaldo('150');
                          setIncMotivo('Recargo por atraso en apartado');
                          setIncreaseModalOpen(true);
                        }}
                        className="alquia-gold-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        Aumentar pago
                      </button>
                    )}
                    {selected.estado === 'vigente' && (
                      <button
                        type="button"
                        onClick={() => setCancelModalOpen(true)}
                        className="alquia-red-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancelar apartado
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmOpen(true)}
                        aria-label={`Eliminar apartado ${selected.folio}`}
                        className="p-2 rounded-xl border border-red-200 dark:border-red-900 text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {selectedHealth.health === 'vencido' && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-extrabold text-[#C81E1E] flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Apartado atrasado por {Math.abs(selectedHealth.daysLeft)} día(s)
                      </div>
                      <div className="text-zinc-700 dark:text-zinc-300 mt-0.5">
                        Cliente: <strong>{selected.clienteNombre}</strong> · Saldo a pagar:{' '}
                        <strong className="font-mono-num">{formatMXN(selected.saldoPendiente)}</strong>
                      </div>
                    </div>
                    <a
                      href={
                        buildOverdueAlertEmail({
                          correoAdmin: configuracion.correoAlertas,
                          nombreTienda: configuracion.nombreComercial,
                          clienteNombre: selected.clienteNombre,
                          clienteTelefono: selected.clienteTelefono,
                          operacionTipo: 'apartado',
                          operacionFolio: selected.folio,
                          fechaLimite: selected.proximoPagoFecha || selected.fechaLimite,
                          diasAtraso: Math.abs(selectedHealth.daysLeft),
                          montoAPagar: selected.saldoPendiente,
                          saldoTotalPendiente: selected.saldoPendiente,
                        }).mailtoUrl
                      }
                      onClick={() => {
                        void registrarAlertaEnviada({
                          operacionTipo: 'apartado',
                          operacionId: selected.id,
                          operacionFolio: selected.folio,
                          clienteId: selected.clienteId,
                          clienteNombre: selected.clienteNombre,
                          clienteTelefono: selected.clienteTelefono,
                          montoAPagar: selected.saldoPendiente,
                          fechaLimite: selected.proximoPagoFecha || selected.fechaLimite,
                          diasAtraso: Math.abs(selectedHealth.daysLeft),
                          correoDestino: configuracion.correoAlertas,
                        });
                      }}
                      className="alquia-red-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Alertar correo Admin
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500">Total</div>
                    <div className="font-mono-num font-bold text-sm mt-0.5">
                      {formatMXN(selected.montoTotal)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500">Abonado</div>
                    <div className="font-mono-num font-bold text-sm text-emerald-600 mt-0.5">
                      {formatMXN(selected.totalAbonado)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                    <div className="text-[11px] text-[#C81E1E]">Saldo pendiente</div>
                    <div className="font-mono-num font-extrabold text-sm text-[#C81E1E] mt-0.5">
                      {formatMXN(selected.saldoPendiente)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500">Próximo / Límite</div>
                    <div className="font-bold text-xs mt-0.5">
                      {formatShortDate(selected.proximoPagoFecha || selected.fechaLimite)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      Lím: {formatShortDate(selected.fechaLimite)}
                    </div>
                  </div>
                </div>

                {/* Registrar abono */}
                {selected.estado === 'vigente' && (
                  <form
                    onSubmit={handleConfirmAbono}
                    className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-[#C81E1E]" />
                        Registrar abono al apartado
                      </h3>
                      <button
                        type="button"
                        onClick={() => setMontoAbono(String(selected.saldoPendiente))}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                      >
                        Liquidar ({formatMXN(selected.saldoPendiente)})
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold mb-1">Monto (MXN)</label>
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          required
                          value={montoAbono}
                          onChange={(e) => setMontoAbono(e.target.value)}
                          placeholder="500"
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold mb-1">Método</label>
                        <select
                          value={metodoAbono}
                          onChange={(e) => setMetodoAbono(e.target.value as MetodoPago)}
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm"
                        >
                          <option value="efectivo">Efectivo</option>
                          <option value="tarjeta">Tarjeta</option>
                          <option value="transferencia">Transferencia</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold mb-1">Notas</label>
                        <input
                          type="text"
                          value={notasAbono}
                          onChange={(e) => setNotasAbono(e.target.value)}
                          placeholder="Opcional"
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={submittingAbono}
                      className="alquia-gold-btn w-full py-2.5 rounded-xl text-xs font-extrabold"
                    >
                      {submittingAbono ? 'Registrando...' : 'Confirmar abono y definir próximo pago'}
                    </button>
                  </form>
                )}

                {/* Historial de abonos */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-display font-bold">
                      Historial de abonos ({selectedAbonos.length})
                    </h3>
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {selectedPunctuality.alDia} al día
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#C81E1E] dark:text-red-400">
                        <Clock className="w-3.5 h-3.5" />
                        {selectedPunctuality.atrasados} atrasado(s)
                      </span>
                    </div>
                  </div>
                  {selectedAbonos.length === 0 ? (
                    <p className="text-xs text-zinc-500">Aún no hay abonos adicionales registrados.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {selectedAbonos.map((ab) => {
                        const abonoStore =
                          (ab.sucursalId
                            ? sucursales.find((s) => s.id === ab.sucursalId)
                            : null) || currentSucursal;
                        const attr = resolveAbonoStoreAttribution({
                          abono: ab,
                          cuentaSucursalId: selected.sucursalId,
                          sucursales,
                        });
                        const abonoTicket = buildAbonoTicketData({
                          abono: ab,
                          apartado: selected,
                          sucursal: abonoStore,
                        });
                        return (
                          <div
                            key={ab.id}
                            className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold">{ab.folio}</span>
                                <span>{formatShortDate(ab.creadoEn)}</span>
                                {ab.estadoPuntualidad === 'atrasado' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-[#C81E1E]">
                                    ATRASADO ({ab.diasAtraso}d)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                    AL DÍA
                                  </span>
                                )}
                                {attr.enOtraTienda && attr.abonoSucursalNombre && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                    Pagado en otra tienda: {attr.abonoSucursalNombre}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-semibold">
                                  Recibió: {ab.cobradorNombre || 'Personal'}
                                </span>
                                {!attr.enOtraTienda && attr.abonoSucursalNombre && (
                                  <span>· Tienda: {attr.abonoSucursalNombre}</span>
                                )}
                                <span>· {ab.metodoPago.toUpperCase()}</span>
                                <span>· Saldo restante: {formatMXN(ab.saldoNuevo)}</span>
                                {ab.notas ? <span>· {ab.notas}</span> : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-extrabold text-sm text-emerald-600">
                                +{formatMXN(ab.monto)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveTicket(abonoTicket)}
                                aria-label={`Abrir recibo digital de abono ${ab.folio}`}
                                title="Ver recibo, enviar por WhatsApp o correo"
                                className="alquia-gold-outline-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                Recibo
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
                                      action: 'downloadAbonoApartadoPDF',
                                      error: err,
                                      context: { folio: ab.folio },
                                    });
                                    notify(formatFriendlyErrorMessage(err), 'error');
                                  }
                                }}
                                aria-label={`Descargar PDF de abono ${ab.folio}`}
                                title="Descargar recibo en PDF"
                                className="alquia-gold-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                PDF
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL POST-ABONO: CONFIRMAR PRÓXIMO PAGO */}
      {nextDatePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Definir próximo pago de apartado"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#EDD06D]" />
                Confirmar fecha del próximo pago
              </h3>
              <p className="text-xs text-zinc-300 mt-0.5">
                Apartado {nextDatePrompt.folio} · {nextDatePrompt.clienteNombre}
              </p>
            </div>
            <form onSubmit={handleSaveNextDate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Fecha del próximo pago</label>
                <input
                  type="date"
                  required
                  value={confirmedNextDate}
                  onChange={(e) => setConfirmedNextDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-bold"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={updateLimitToo}
                  onChange={(e) => setUpdateLimitToo(e.target.checked)}
                />
                Actualizar también la fecha límite del apartado a esta fecha
              </label>
              <button
                type="submit"
                disabled={savingNextDate}
                className="alquia-gold-btn w-full py-3 rounded-xl text-xs font-extrabold"
              >
                {savingNextDate ? 'Guardando...' : 'Guardar próximo pago y generar comprobante'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NUEVO CLIENTE / APARTADO */}
      {newModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo cliente y apartado"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h2 className="text-base font-display font-bold">Nuevo cliente / Apartado</h2>
                <p className="text-xs text-zinc-300">
                  Registra el cliente con su WhatsApp y aparta el mueble con anticipo inicial
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                aria-label="Cerrar modal"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateApartado} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setClientMode('nuevo')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                      clientMode === 'nuevo'
                        ? 'alquia-gold-btn'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    + Nuevo cliente (con WhatsApp)
                  </button>
                  {clientes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setClientMode('existente')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                        clientMode === 'existente'
                          ? 'alquia-gold-btn'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      Cliente existente ({clientes.length})
                    </button>
                  )}
                </div>

                {clientMode === 'nuevo' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div>
                      <label className="block text-xs font-bold mb-1">Nombre completo *</label>
                      <input
                        type="text"
                        required
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        placeholder="Ej. Carlos Ramírez"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-[#C81E1E] dark:text-red-400">
                        Número de WhatsApp (10 dígitos) *
                      </label>
                      <input
                        type="tel"
                        required
                        value={nuevoWhatsApp}
                        onChange={(e) => setNuevoWhatsApp(e.target.value)}
                        placeholder="Ej. 4131234567"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Dirección</label>
                      <input
                        type="text"
                        value={nuevaDireccion}
                        onChange={(e) => setNuevaDireccion(e.target.value)}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Referencias</label>
                      <input
                        type="text"
                        value={nuevasReferencias}
                        onChange={(e) => setNuevasReferencias(e.target.value)}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold mb-1">Seleccionar cliente *</label>
                    <select
                      required
                      value={existingClientId}
                      onChange={(e) => setExistingClientId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    >
                      {clientes.map((cli) => (
                        <option key={cli.id} value={cli.id}>
                          {cli.nombre} · WA: {cli.telefono}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      Producto del inventario (opcional)
                    </label>
                    <select
                      value={selectedProdId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedProdId(id);
                        const found = productos.find((p) => p.id === id);
                        if (found) {
                          setDescripcionItem(found.nombre);
                          setMontoTotal(String(found.precioCredito || found.precioContado));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    >
                      <option value="">-- Capturar mueble manualmente --</option>
                      {productos
                        .map((p) => ({
                          p,
                          avail: getProductStoreAvailability({
                            producto: p,
                            inventarioSucursales,
                            sucursales,
                            currentSucursalId: activeSucursalId,
                          }),
                        }))
                        .filter(({ p, avail }) => p.activo && avail.ownStockDisponible > 0)
                        .map(({ p, avail }) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({formatMXN(p.precioCredito)} · Disp aquí: {avail.ownStockDisponible})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Descripción del artículo *</label>
                    <input
                      type="text"
                      required
                      value={descripcionItem}
                      onChange={(e) => setDescripcionItem(e.target.value)}
                      placeholder="Ej. Recámara King Size Nogal"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Precio total (MXN) *</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={montoTotal}
                      onChange={(e) => setMontoTotal(e.target.value)}
                      placeholder="9500"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Anticipo inicial (MXN) *</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={anticipoInicial}
                      onChange={(e) => setAnticipoInicial(e.target.value)}
                      placeholder="1500"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Método de pago</label>
                    <select
                      value={metodoAnticipo}
                      onChange={(e) => setMetodoAnticipo(e.target.value as MetodoPago)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Próximo pago</label>
                    <input
                      type="date"
                      required
                      value={proximoPago}
                      onChange={(e) => setProximoPago(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Fecha límite liquidación *</label>
                    <input
                      type="date"
                      required
                      value={fechaLimite}
                      onChange={(e) => setFechaLimite(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">Condiciones del apartado</label>
                  <input
                    type="text"
                    value={condiciones}
                    onChange={(e) => setCondiciones(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingNew}
                  className="alquia-gold-btn px-5 py-2.5 rounded-xl text-xs font-extrabold"
                >
                  {submittingNew ? 'Guardando...' : 'Crear apartado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CANCELACIÓN DE APARTADO */}
      {cancelModalOpen && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar apartado"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#C81E1E] text-white">
              <h3 className="text-base font-display font-bold">
                Cancelar apartado {selected.folio}
              </h3>
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                aria-label="Cerrar cancelación"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCancelApartado} className="p-5 space-y-4">
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                Total abonado por el cliente:{' '}
                <strong className="font-mono-num">{formatMXN(selected.totalAbonado)}</strong>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Resolución del anticipo</label>
                <select
                  value={resolucion}
                  onChange={(e) =>
                    setResolucion(e.target.value as Exclude<ResolucionCancelacion, 'ninguna'>)
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                >
                  <option value="saldo_a_favor">Convertir a saldo a favor del cliente</option>
                  <option value="reembolso">Reembolso completo en efectivo</option>
                  <option value="penalizacion">Aplicar penalización parcial</option>
                </select>
              </div>
              {resolucion === 'penalizacion' && (
                <div>
                  <label className="block text-xs font-bold mb-1">Monto retenido (MXN)</label>
                  <input
                    type="number"
                    min="0"
                    max={selected.totalAbonado}
                    step="0.01"
                    required
                    value={penalizacion}
                    onChange={(e) => setPenalizacion(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold mb-1">Motivo de cancelación</label>
                <input
                  type="text"
                  required
                  value={motivoCancel}
                  onChange={(e) => setMotivoCancel(e.target.value)}
                  placeholder="Ej. Solicitud del cliente"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={submittingCancel}
                  className="alquia-red-btn px-5 py-2 rounded-xl text-xs font-bold"
                >
                  {submittingCancel ? 'Cancelando...' : 'Confirmar cancelación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ADMIN: AUMENTAR PAGO / RECARGO */}
      {increaseModalOpen && selected && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Aumentar saldo de apartado atrasado"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h3 className="text-base font-display font-bold">Aumentar saldo · {selected.folio}</h3>
                <p className="text-xs text-zinc-300">
                  {selected.clienteNombre} · Saldo actual: {formatMXN(selected.saldoPendiente)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIncreaseModalOpen(false)}
                aria-label="Cerrar aumento"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleIncreasePayment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Aumento / recargo al saldo (MXN)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={incSaldo}
                  onChange={(e) => setIncSaldo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Motivo *</label>
                <input
                  type="text"
                  required
                  value={incMotivo}
                  onChange={(e) => setIncMotivo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIncreaseModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingInc}
                  className="alquia-gold-btn px-5 py-2 rounded-xl text-xs font-extrabold"
                >
                  {submittingInc ? 'Aplicando...' : 'Aplicar aumento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ADMIN: ELIMINAR APARTADO */}
      {deleteConfirmOpen && selected && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar apartado"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#C81E1E]" />
                Eliminar apartado
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                ¿Seguro que deseas eliminar permanentemente el apartado{' '}
                <strong>
                  {selected.folio} ({selected.clienteNombre})
                </strong>
                ? Esta acción es exclusiva del Administrador.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingApartado}
                  onClick={() => void handleDeleteApartado()}
                  className="alquia-red-btn px-5 py-2 rounded-xl text-xs font-extrabold disabled:opacity-60"
                >
                  {deletingApartado ? 'Eliminando...' : 'Sí, eliminar apartado'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
