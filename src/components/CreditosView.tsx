import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
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
import type { Credito, FrecuenciaPago, MetodoPago, TicketData } from '../types/pos';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';
import {
  addFrequencyToDate,
  buildAbonoTicketData,
  buildOverdueAlertEmail,
  buildWhatsAppLink,
  buildWhatsAppTicketText,
  formatMXN,
  formatShortDate,
  getCreditHealth,
  getProductStoreAvailability,
  resolveAbonoStoreAttribution,
  todayISODate,
} from '../utils/finance';
import { downloadFullPageTicketPDF } from '../utils/pdfTicket';

interface PendingNextDatePrompt {
  creditoId: string;
  folio: string;
  clienteNombre: string;
  suggestedDate: string;
  ticket: TicketData;
  wasLate: boolean;
  diasAtraso: number;
  montoAPagar: number;
}

interface CreditosViewProps {
  initialSelectedId?: string | null;
  onClearInitialSelected?: () => void;
}

export function CreditosView({ initialSelectedId, onClearInitialSelected }: CreditosViewProps = {}) {
  const {
    user,
    creditos,
    abonos,
    clientes,
    productos,
    sucursales,
    inventarioSucursales,
    activeSucursalId,
    currentSucursal,
    configuracion,
    addCliente,
    crearCreditoDirecto,
    deleteCredito,
    registrarAbonoCredito,
    actualizarProximaFechaPago,
    aumentarPagoUsuarioAtrasado,
    registrarAlertaEnviada,
    setActiveTicket,
    notify,
  } = useStore();
  const isAdmin = user?.rol === 'admin';

  const [filter, setFilter] = useState<'todos' | 'vencidos' | 'por_vencer' | 'al_corriente' | 'liquidados'>('todos');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      onClearInitialSelected?.();
    }
  }, [initialSelectedId, onClearInitialSelected]);

  // Form Abono
  const [montoAbono, setMontoAbono] = useState('');
  const [metodoAbono, setMetodoAbono] = useState<MetodoPago>('efectivo');
  const [notasAbono, setNotasAbono] = useState('');
  const [submittingAbono, setSubmittingAbono] = useState(false);

  // Modal post-abono: Pedir fecha de próximo pago
  const [nextDatePrompt, setNextDatePrompt] = useState<PendingNextDatePrompt | null>(null);
  const [confirmedNextDate, setConfirmedNextDate] = useState('');
  const [savingNextDate, setSavingNextDate] = useState(false);

  // Modal: Nuevo Cliente / Nueva Cuenta de Crédito
  const [newCreditModalOpen, setNewCreditModalOpen] = useState(false);
  const [clientMode, setClientMode] = useState<'nuevo' | 'existente'>('nuevo');
  const [existingClientId, setExistingClientId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoWhatsApp, setNuevoWhatsApp] = useState('');
  const [nuevaDireccion, setNuevaDireccion] = useState('');
  const [nuevasReferencias, setNuevasReferencias] = useState('');

  const [selectedProdId, setSelectedProdId] = useState('');
  const [descripcionItem, setDescripcionItem] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [enganche, setEnganche] = useState('0');
  const [metodoEnganche, setMetodoEnganche] = useState<MetodoPago>('efectivo');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>('semanal');
  const [numPagos, setNumPagos] = useState('12');
  const [primeraFechaPago, setPrimeraFechaPago] = useState(() =>
    addFrequencyToDate(todayISODate(), 'semanal')
  );
  const [submittingNewCredit, setSubmittingNewCredit] = useState(false);

  // Admin: Aumentar pago atrasado & Eliminar cuenta de crédito
  const [increaseModalOpen, setIncreaseModalOpen] = useState(false);
  const [incSaldo, setIncSaldo] = useState('150');
  const [incNuevaCuota, setIncNuevaCuota] = useState('');
  const [incMotivo, setIncMotivo] = useState('Recargo por atraso en fecha límite');
  const [submittingInc, setSubmittingInc] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingCredit, setDeletingCredit] = useState(false);

  const today = todayISODate();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return creditos.filter((c) => {
      const { health } = getCreditHealth(c, today);
      if (filter === 'vencidos' && health !== 'vencido') return false;
      if (filter === 'por_vencer' && health !== 'por_vencer') return false;
      if (filter === 'al_corriente' && health !== 'al_corriente') return false;
      if (filter === 'liquidados' && health !== 'liquidado') return false;
      if (!q) return true;
      return (
        c.clienteNombre.toLowerCase().includes(q) ||
        c.folio.toLowerCase().includes(q) ||
        c.clienteTelefono.includes(q)
      );
    });
  }, [creditos, filter, search, today]);

  const selected: Credito | null =
    creditos.find((c) => c.id === selectedId) || filtered[0] || null;

  const selectedAbonos = useMemo(
    () =>
      selected
        ? abonos.filter((a) => a.tipoOperacion === 'credito' && a.operacionId === selected.id)
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

  const overdueCredits = useMemo(
    () =>
      creditos.filter(
        (c) => c.estado === 'activo' && getCreditHealth(c, today).health === 'vencido'
      ),
    [creditos, today]
  );

  const openNewCreditModal = () => {
    setClientMode(clientes.length === 0 ? 'nuevo' : 'nuevo');
    setExistingClientId(clientes[0]?.id || '');
    setNuevoNombre('');
    setNuevoWhatsApp('');
    setNuevaDireccion('');
    setNuevasReferencias('');
    setSelectedProdId('');
    setDescripcionItem('');
    setMontoTotal('');
    setEnganche('0');
    setFrecuencia('semanal');
    setNumPagos('12');
    setPrimeraFechaPago(addFrequencyToDate(todayISODate(), 'semanal'));
    setNewCreditModalOpen(true);
  };

  const handleCreateCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingNewCredit(true);
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

      await crearCreditoDirecto({
        clienteId,
        productoId: selectedProdId || undefined,
        cantidad: 1,
        descripcion: descripcionItem,
        montoTotal: Number(montoTotal),
        enganche: Number(enganche) || 0,
        metodoPago: metodoEnganche,
        frecuencia,
        numPagos: Number(numPagos) || 12,
        primeraFechaPago,
      });

      setNewCreditModalOpen(false);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingNewCredit(false);
    }
  };

  const handleConfirmAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const monto = Number(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      notify('Ingresa un monto de abono válido mayor a $0.', 'error');
      return;
    }
    setSubmittingAbono(true);
    try {
      const res = await registrarAbonoCredito({
        creditoId: selected.id,
        monto,
        metodoPago: metodoAbono,
        notas: notasAbono,
        deferTicket: true,
      });
      setMontoAbono('');
      setNotasAbono('');

      if (!res.liquidado) {
        setConfirmedNextDate(res.suggestedNextDate);
        setNextDatePrompt({
          creditoId: selected.id,
          folio: selected.folio,
          clienteNombre: selected.clienteNombre,
          suggestedDate: res.suggestedNextDate,
          ticket: res.ticket,
          wasLate: Boolean(res.overdueAlert),
          diasAtraso: res.overdueAlert?.diasAtraso || 0,
          montoAPagar: res.overdueAlert?.montoAPagar || selected.montoPago,
        });
      }
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingAbono(false);
    }
  };

  const handleSaveNextPaymentDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextDatePrompt) return;
    setSavingNextDate(true);
    try {
      await actualizarProximaFechaPago({
        tipo: 'credito',
        operacionId: nextDatePrompt.creditoId,
        nuevaFecha: confirmedNextDate,
      });
      setActiveTicket({
        ...nextDatePrompt.ticket,
        proximoPagoFecha: confirmedNextDate,
      });
      setNextDatePrompt(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingNextDate(false);
    }
  };

  const handleIncreasePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !isAdmin) return;
    setSubmittingInc(true);
    try {
      await aumentarPagoUsuarioAtrasado({
        tipo: 'credito',
        operacionId: selected.id,
        incrementoSaldo: Number(incSaldo) || 0,
        nuevoMontoPago: incNuevaCuota ? Number(incNuevaCuota) : undefined,
        motivo: incMotivo,
      });
      setIncreaseModalOpen(false);
      setIncSaldo('150');
      setIncNuevaCuota('');
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingInc(false);
    }
  };

  const handleDeleteCredit = async () => {
    if (!selected || !isAdmin) return;
    setDeletingCredit(true);
    try {
      await deleteCredito(selected.id);
      setDeleteConfirmOpen(false);
      setSelectedId(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingCredit(false);
    }
  };

  const selectedHealth = selected ? getCreditHealth(selected, today) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white tracking-tight">
            Línea de Crédito y Cobranza
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Registra clientes con WhatsApp, controla abonos al día o atrasados, programa el próximo pago y envía comprobantes PDF o WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewCreditModal}
          className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente / crédito
        </button>
      </div>

      {/* Banner de alertas vencidas con correo al Administrador */}
      {overdueCredits.length > 0 && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/35 border border-red-300 dark:border-red-900 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#C81E1E] shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-[#C81E1E] dark:text-red-300">
                {overdueCredits.length} crédito(s) superaron su fecha límite de pago
              </div>
              <div className="text-zinc-700 dark:text-zinc-300 mt-0.5">
                {overdueCredits
                  .slice(0, 3)
                  .map((c) => `${c.clienteNombre} (${formatMXN(Math.min(c.montoPago, c.saldoPendiente))})`)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">
            Correo alertas: <strong>{configuracion.correoAlertas}</strong>
          </span>
        </div>
      )}

      {/* Filtros y buscador */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'todos', label: `Todos (${creditos.length})` },
              { id: 'vencidos', label: `Vencidos (${overdueCredits.length})` },
              { id: 'por_vencer', label: 'Por vencer' },
              { id: 'al_corriente', label: 'Al día' },
              { id: 'liquidados', label: 'Liquidados' },
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

      {/* Layout Principal */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-12 text-center alquia-card space-y-3">
          <CreditCard className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700" />
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            No hay cuentas de crédito registradas en esta vista.
          </p>
          <button
            type="button"
            onClick={openNewCreditModal}
            className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
          >
            <UserPlus className="w-4 h-4" />
            Agregar primer cliente a crédito
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lista de créditos */}
          <div className="lg:col-span-5 space-y-3">
            {filtered.map((c) => {
              const { health, daysDiff } = getCreditHealth(c, today);
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id);
                    setMontoAbono(String(Math.min(c.montoPago, c.saldoPendiente)));
                  }}
                  className={`w-full text-left rounded-2xl p-4 border transition-all alquia-card ${
                    isSelected
                      ? 'bg-[#111114] text-white border-[#D4A329] ring-2 ring-[#D4A329]/40'
                      : 'bg-white dark:bg-[#141418] border-zinc-200 dark:border-zinc-800 hover:border-zinc-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                            isSelected ? 'bg-[#C81E1E] text-white' : 'bg-zinc-100 dark:bg-zinc-800'
                          }`}
                        >
                          {c.folio}
                        </span>
                        <span className="text-[11px] opacity-75 capitalize">{c.frecuencia}</span>
                      </div>
                      <div className="font-display font-bold text-sm mt-1">{c.clienteNombre}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">
                        WhatsApp: {c.clienteTelefono || 'Sin número'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono-num font-extrabold text-sm ${
                          isSelected ? 'text-[#EDD06D]' : 'text-[#C81E1E] dark:text-red-400'
                        }`}
                      >
                        {formatMXN(c.saldoPendiente)}
                      </div>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          health === 'vencido'
                            ? 'bg-[#C81E1E] text-white'
                            : health === 'liquidado'
                              ? 'bg-emerald-600 text-white'
                              : health === 'por_vencer'
                                ? 'bg-amber-500 text-black'
                                : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {health === 'vencido'
                          ? `Atrasado ${Math.abs(daysDiff)}d`
                          : health === 'liquidado'
                            ? 'Liquidado'
                            : health === 'por_vencer'
                              ? `Vence en ${daysDiff}d`
                              : 'Al día'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle del crédito seleccionado */}
          {selected && selectedHealth && (
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 alquia-card space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-[#111114] text-white">
                        {selected.folio}
                      </span>
                      <span className="text-xs font-semibold text-zinc-500 capitalize">
                        Plan {selected.frecuencia} · {selected.pagosRealizados}/{selected.numPagos} pagos
                      </span>
                    </div>
                    <h2 className="text-xl font-display font-extrabold mt-1">
                      {selected.clienteNombre}
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">{selected.itemsResumen}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={buildWhatsAppLink(
                        selected.clienteTelefono,
                        buildWhatsAppTicketText(
                          {
                            tipoDocumento: 'venta_credito',
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
                            montoTotal: selected.montoTotal,
                            saldoAnterior: selected.montoTotal,
                            pagoRecibido: selected.totalAbonado,
                            saldoPendiente: selected.saldoPendiente,
                            proximoPagoFecha:
                              selected.saldoPendiente > 0 ? selected.proximaFechaPago : undefined,
                            planInfo: `${selected.pagosRealizados}/${selected.numPagos} pagos ${selected.frecuencia}es de ${formatMXN(selected.montoPago)}`,
                            estadoPuntualidad:
                              selectedHealth.health === 'vencido' ? 'atrasado' : 'al_dia',
                            diasAtraso:
                              selectedHealth.health === 'vencido'
                                ? Math.abs(selectedHealth.daysDiff)
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
                      WhatsApp ({selected.clienteTelefono || '—'})
                    </a>

                    {isAdmin && selected.estado === 'activo' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIncSaldo('150');
                          setIncNuevaCuota(String(selected.montoPago));
                          setIncMotivo('Recargo por atraso en fecha límite');
                          setIncreaseModalOpen(true);
                        }}
                        className="alquia-gold-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        Aumentar pago
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmOpen(true)}
                        className="alquia-red-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar cuenta
                      </button>
                    )}
                  </div>
                </div>

                {/* Alerta específica si está vencido → enviar al correo del Administrador */}
                {selectedHealth.health === 'vencido' && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-extrabold text-[#C81E1E] dark:text-red-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Pago atrasado por {Math.abs(selectedHealth.daysDiff)} día(s)
                      </div>
                      <div className="text-zinc-700 dark:text-zinc-300 mt-0.5">
                        Cliente: <strong>{selected.clienteNombre}</strong> · Monto a pagar:{' '}
                        <strong className="font-mono-num">
                          {formatMXN(Math.min(selected.montoPago, selected.saldoPendiente))}
                        </strong>
                      </div>
                    </div>

                    <a
                      href={
                        buildOverdueAlertEmail({
                          correoAdmin: configuracion.correoAlertas,
                          nombreTienda: configuracion.nombreComercial,
                          clienteNombre: selected.clienteNombre,
                          clienteTelefono: selected.clienteTelefono,
                          operacionTipo: 'credito',
                          operacionFolio: selected.folio,
                          fechaLimite: selected.proximaFechaPago,
                          diasAtraso: Math.abs(selectedHealth.daysDiff),
                          montoAPagar: Math.min(selected.montoPago, selected.saldoPendiente),
                          saldoTotalPendiente: selected.saldoPendiente,
                        }).mailtoUrl
                      }
                      onClick={() => {
                        void registrarAlertaEnviada({
                          operacionTipo: 'credito',
                          operacionId: selected.id,
                          operacionFolio: selected.folio,
                          clienteId: selected.clienteId,
                          clienteNombre: selected.clienteNombre,
                          clienteTelefono: selected.clienteTelefono,
                          montoAPagar: Math.min(selected.montoPago, selected.saldoPendiente),
                          fechaLimite: selected.proximaFechaPago,
                          diasAtraso: Math.abs(selectedHealth.daysDiff),
                          correoDestino: configuracion.correoAlertas,
                        });
                      }}
                      className="alquia-red-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Enviar alerta a {configuracion.correoAlertas}
                    </a>
                  </div>
                )}

                {/* Resumen numérico */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500">Total crédito</div>
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
                    <div className="text-[11px] text-zinc-500">Próximo pago</div>
                    <div className="font-bold text-sm mt-0.5">
                      {selected.estado === 'liquidado'
                        ? 'Liquidado'
                        : formatShortDate(selected.proximaFechaPago)}
                    </div>
                  </div>
                </div>

                {/* Registrar abono */}
                {selected.estado === 'activo' && (
                  <form
                    onSubmit={handleConfirmAbono}
                    className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-[#C81E1E]" />
                        Registrar abono
                      </h3>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setMontoAbono(String(Math.min(selected.montoPago, selected.saldoPendiente)))
                          }
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                        >
                          Cuota ({formatMXN(Math.min(selected.montoPago, selected.saldoPendiente))})
                        </button>
                        <button
                          type="button"
                          onClick={() => setMontoAbono(String(selected.saldoPendiente))}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
                        >
                          Liquidar ({formatMXN(selected.saldoPendiente)})
                        </button>
                      </div>
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
                          placeholder={String(selected.montoPago)}
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
                      {submittingAbono ? 'Registrando pago...' : 'Confirmar pago y definir próximo pago'}
                    </button>
                  </form>
                )}

                {/* Historial de pagos Al día vs Atrasados */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-display font-bold">
                      Historial de pagos de esta cuenta ({selectedAbonos.length})
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
                    <p className="text-xs text-zinc-500">Aún no se registran abonos en este crédito.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
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
                          credito: selected,
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
                                      action: 'downloadAbonoCreditoPDF',
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

      {/* MODAL POST-ABONO: PEDIR PRÓXIMO PAGO */}
      {nextDatePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Definir fecha de próximo pago"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#EDD06D]" />
                Confirmar fecha del próximo pago
              </h3>
              <p className="text-xs text-zinc-300 mt-0.5">
                Pago confirmado para {nextDatePrompt.clienteNombre} ({nextDatePrompt.folio})
              </p>
            </div>

            <form onSubmit={handleSaveNextPaymentDate} className="p-5 space-y-4">
              {nextDatePrompt.wasLate && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 p-3 text-xs space-y-2">
                  <div className="font-bold text-[#C81E1E]">
                    Este pago superó la fecha límite por {nextDatePrompt.diasAtraso} día(s).
                  </div>
                  <a
                    href={
                      buildOverdueAlertEmail({
                        correoAdmin: configuracion.correoAlertas,
                        nombreTienda: configuracion.nombreComercial,
                        clienteNombre: nextDatePrompt.clienteNombre,
                        clienteTelefono: nextDatePrompt.ticket.clienteTelefono,
                        operacionTipo: 'credito',
                        operacionFolio: nextDatePrompt.folio,
                        fechaLimite: today,
                        diasAtraso: nextDatePrompt.diasAtraso,
                        montoAPagar: nextDatePrompt.montoAPagar,
                        saldoTotalPendiente: nextDatePrompt.ticket.saldoPendiente,
                      }).mailtoUrl
                    }
                    className="alquia-red-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Notificar atraso a {configuracion.correoAlertas}
                  </a>
                </div>
              )}

              <div>
                <label
                  htmlFor="next-payment-date-credit"
                  className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  ¿Cuándo será el próximo pago de este cliente?
                </label>
                <input
                  id="next-payment-date-credit"
                  type="date"
                  required
                  value={confirmedNextDate}
                  onChange={(e) => setConfirmedNextDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-bold"
                />
              </div>

              <button
                type="submit"
                disabled={savingNextDate}
                className="alquia-gold-btn w-full py-3 rounded-xl text-xs font-extrabold"
              >
                {savingNextDate ? 'Guardando fecha...' : 'Guardar próximo pago y generar comprobante'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AGREGAR CLIENTE (CON WHATSAPP) Y NUEVA CUENTA DE CRÉDITO */}
      {newCreditModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo cliente y crédito"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h2 className="text-base font-display font-bold">
                  Nuevo cliente en Línea de Crédito
                </h2>
                <p className="text-xs text-zinc-300">
                  Registra el WhatsApp del cliente para enviar comprobantes PDF y seguimiento
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewCreditModalOpen(false)}
                aria-label="Cerrar modal"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCredit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              {/* Selección o alta de cliente */}
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
                        placeholder="Ej. María González"
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
                        placeholder="Calle, colonia, Apaseo el Alto"
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

              {/* Artículo y Plan de Crédito */}
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
                    <label className="block text-xs font-bold mb-1">
                      Descripción del mueble / artículo *
                    </label>
                    <input
                      type="text"
                      required
                      value={descripcionItem}
                      onChange={(e) => setDescripcionItem(e.target.value)}
                      placeholder="Ej. Comedor 6 sillas madera"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Monto total (MXN) *</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={montoTotal}
                      onChange={(e) => setMontoTotal(e.target.value)}
                      placeholder="12000"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Enganche inicial (MXN)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={enganche}
                      onChange={(e) => setEnganche(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Método de enganche</label>
                    <select
                      value={metodoEnganche}
                      onChange={(e) => setMetodoEnganche(e.target.value as MetodoPago)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Frecuencia de pago</label>
                    <select
                      value={frecuencia}
                      onChange={(e) => {
                        const freq = e.target.value as FrecuenciaPago;
                        setFrecuencia(freq);
                        setPrimeraFechaPago(addFrequencyToDate(todayISODate(), freq));
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quincenal">Quincenal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Número de pagos</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      required
                      value={numPagos}
                      onChange={(e) => setNumPagos(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Fecha del primer pago</label>
                    <input
                      type="date"
                      required
                      value={primeraFechaPago}
                      onChange={(e) => setPrimeraFechaPago(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNewCreditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingNewCredit}
                  className="alquia-gold-btn px-5 py-2.5 rounded-xl text-xs font-extrabold"
                >
                  {submittingNewCredit ? 'Registrando...' : 'Crear cuenta de crédito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ADMIN: AUMENTAR PAGO / RECARGO POR ATRASO */}
      {increaseModalOpen && selected && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Aumentar pago por atraso"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h3 className="text-base font-display font-bold">Aumentar pago · {selected.folio}</h3>
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
                  min="0"
                  step="0.01"
                  required
                  value={incSaldo}
                  onChange={(e) => setIncSaldo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Nueva cuota por pago (opcional)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={incNuevaCuota}
                  onChange={(e) => setIncNuevaCuota(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
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

      {/* MODAL ADMIN: ELIMINAR CUENTA DE CRÉDITO */}
      {deleteConfirmOpen && selected && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar cuenta de crédito"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#C81E1E]" />
                Eliminar cuenta de crédito
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                ¿Seguro que deseas eliminar la cuenta de crédito{' '}
                <strong>
                  {selected.folio} ({selected.clienteNombre})
                </strong>
                ? Esta acción es exclusiva del Administrador y no se puede deshacer.
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
                  disabled={deletingCredit}
                  onClick={() => void handleDeleteCredit()}
                  className="alquia-red-btn px-5 py-2 rounded-xl text-xs font-extrabold disabled:opacity-60"
                >
                  {deletingCredit ? 'Eliminando...' : 'Sí, eliminar cuenta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
