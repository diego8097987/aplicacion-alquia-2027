import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Bug,
  CreditCard,
  Download,
  Mail,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Apartado, Credito, Sucursal, UserRole } from '../types/pos';
import {
  clearErrorLogs,
  exportErrorLogsJSON,
  formatFriendlyErrorMessage,
  getErrorLogs,
  subscribeErrorLogs,
  type ErrorLogEntry,
} from '../utils/errorHandler';
import {
  formatDateTimeMX,
  formatMXN,
  formatShortDate,
  getCreditHealth,
  getLayawayHealth,
  todayISODate,
} from '../utils/finance';

type AdminSubTab = 'cuentas' | 'alertas' | 'personal' | 'tiendas' | 'ticket' | 'errores';

export function ConfigDeployView() {
  const {
    user,
    configuracion,
    usuarios,
    sucursales,
    currentSucursal,
    creditos,
    apartados,
    alertas,
    saveConfiguracion,
    saveUsuarioStaff,
    saveSucursal,
    runAutoDueAlertsCheck,
    aumentarPagoUsuarioAtrasado,
    deleteCredito,
    deleteApartado,
    notify,
  } = useStore();

  const [subTab, setSubTab] = useState<AdminSubTab>('cuentas');
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>(() => getErrorLogs());

  useEffect(() => {
    setErrorLogs(getErrorLogs());
    return subscribeErrorLogs((nextLogs) => setErrorLogs(nextLogs));
  }, []);

  // --- Ticket Header & Alertas Config ---
  const [nombreComercial, setNombreComercial] = useState(configuracion.nombreComercial);
  const [ubicacion, setUbicacion] = useState(configuracion.ubicacion);
  const [telefono, setTelefono] = useState(configuracion.telefono);
  const [mensajeTicket, setMensajeTicket] = useState(configuracion.mensajeTicket);
  const [correoAlertas, setCorreoAlertas] = useState(configuracion.correoAlertas || '');
  const [alertasActivas, setAlertasActivas] = useState(configuracion.alertasAutomaticasActivas);
  const [diasAnticipacion, setDiasAnticipacion] = useState(
    String(configuracion.diasAnticipacionAlerta ?? 3)
  );
  const [plantillaAsunto, setPlantillaAsunto] = useState(configuracion.plantillaAsuntoAlerta || '');
  const [plantillaCuerpo, setPlantillaCuerpo] = useState(configuracion.plantillaCuerpoAlerta || '');
  const [emailjsServiceId, setEmailjsServiceId] = useState(configuracion.emailjsServiceId || '');
  const [emailjsTemplateId, setEmailjsTemplateId] = useState(configuracion.emailjsTemplateId || '');
  const [emailjsPublicKey, setEmailjsPublicKey] = useState(configuracion.emailjsPublicKey || '');
  const [savingConfig, setSavingConfig] = useState(false);
  const [runningAlerts, setRunningAlerts] = useState(false);

  useEffect(() => {
    setNombreComercial(configuracion.nombreComercial);
    setUbicacion(configuracion.ubicacion);
    setTelefono(configuracion.telefono);
    setMensajeTicket(configuracion.mensajeTicket);
    setCorreoAlertas(configuracion.correoAlertas || '');
    setAlertasActivas(configuracion.alertasAutomaticasActivas);
    setDiasAnticipacion(String(configuracion.diasAnticipacionAlerta ?? 3));
    setPlantillaAsunto(configuracion.plantillaAsuntoAlerta || '');
    setPlantillaCuerpo(configuracion.plantillaCuerpoAlerta || '');
    setEmailjsServiceId(configuracion.emailjsServiceId || '');
    setEmailjsTemplateId(configuracion.emailjsTemplateId || '');
    setEmailjsPublicKey(configuracion.emailjsPublicKey || '');
  }, [configuracion]);

  // --- Cuentas Activas: Aumentar pago / Eliminar ---
  const [increaseTarget, setIncreaseTarget] = useState<{
    tipo: 'credito' | 'apartado';
    item: Credito | Apartado;
  } | null>(null);
  const [incSaldo, setIncSaldo] = useState('150');
  const [incNuevaCuota, setIncNuevaCuota] = useState('');
  const [incMotivo, setIncMotivo] = useState('Recargo por atraso en fecha límite');
  const [savingInc, setSavingInc] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    tipo: 'credito' | 'apartado';
    id: string;
    folio: string;
    clienteNombre: string;
  } | null>(null);
  const [deletingAcc, setDeletingAcc] = useState(false);

  // --- Personal y Cargos ---
  const [staffUid, setStaffUid] = useState('');
  const [staffNombre, setStaffNombre] = useState('');
  const [staffCorreo, setStaffCorreo] = useState('');
  const [staffRol, setStaffRol] = useState<UserRole>('cobrador');
  const [staffSucursalId, setStaffSucursalId] = useState('');
  const [staffActivo, setStaffActivo] = useState(true);
  const [savingStaff, setSavingStaff] = useState(false);

  // --- Tiendas y Encargados ---
  const [editingSucursalId, setEditingSucursalId] = useState<string | undefined>(undefined);
  const [sucNombre, setSucNombre] = useState('');
  const [sucDireccion, setSucDireccion] = useState('');
  const [sucTelefono, setSucTelefono] = useState('');
  const [sucEncargadoUid, setSucEncargadoUid] = useState('');
  const [savingSucursal, setSavingSucursal] = useState(false);

  const today = todayISODate();

  const activeCreditos = useMemo(
    () => creditos.filter((c) => c.estado === 'activo'),
    [creditos]
  );
  const activeApartados = useMemo(
    () => apartados.filter((a) => a.estado === 'vigente'),
    [apartados]
  );

  if (user?.rol !== 'admin') {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-8 text-center">
        <ShieldCheck className="w-10 h-10 mx-auto text-[#C81E1E]" />
        <h2 className="mt-3 text-base font-display font-bold">Acceso exclusivo de Administrador</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Inicia sesión con la cuenta de Administrador para gestionar personal, tiendas, alertas y cuentas.
        </p>
      </div>
    );
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await saveConfiguracion({
        nombreComercial,
        ubicacion,
        telefono,
        mensajeTicket,
        correoAlertas,
        alertasAutomaticasActivas: alertasActivas,
        diasAnticipacionAlerta: Math.max(0, Math.min(30, Number(diasAnticipacion) || 3)),
        plantillaAsuntoAlerta: plantillaAsunto,
        plantillaCuerpoAlerta: plantillaCuerpo,
        emailjsServiceId,
        emailjsTemplateId,
        emailjsPublicKey,
      });
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunAlertsNow = async () => {
    setRunningAlerts(true);
    try {
      await runAutoDueAlertsCheck(false);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setRunningAlerts(false);
    }
  };

  const handleApplyIncrease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!increaseTarget) return;
    setSavingInc(true);
    try {
      await aumentarPagoUsuarioAtrasado({
        tipo: increaseTarget.tipo,
        operacionId: increaseTarget.item.id,
        incrementoSaldo: Number(incSaldo) || 0,
        nuevoMontoPago:
          increaseTarget.tipo === 'credito' && incNuevaCuota ? Number(incNuevaCuota) : undefined,
        motivo: incMotivo,
      });
      setIncreaseTarget(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingInc(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (!deleteTarget) return;
    setDeletingAcc(true);
    try {
      if (deleteTarget.tipo === 'credito') {
        await deleteCredito(deleteTarget.id);
      } else {
        await deleteApartado(deleteTarget.id);
      }
      setDeleteTarget(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingAcc(false);
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStaff(true);
    try {
      await saveUsuarioStaff({
        uid: staffUid.trim(),
        nombre: staffNombre.trim(),
        correo: staffCorreo.trim(),
        rol: staffRol,
        sucursalId: staffSucursalId || undefined,
        activo: staffActivo,
      });
      setStaffUid('');
      setStaffNombre('');
      setStaffCorreo('');
      setStaffRol('cobrador');
      setStaffSucursalId('');
      setStaffActivo(true);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleEditSucursal = (s: Sucursal) => {
    setEditingSucursalId(s.id);
    setSucNombre(s.nombre);
    setSucDireccion(s.direccion);
    setSucTelefono(s.telefono || '');
    setSucEncargadoUid(s.encargadoUid || '');
  };

  const handleSaveSucursal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSucursal(true);
    try {
      const encargadoUser = usuarios.find((u) => u.uid === sucEncargadoUid);
      await saveSucursal({
        id: editingSucursalId,
        nombre: sucNombre.trim(),
        direccion: sucDireccion.trim(),
        telefono: sucTelefono.trim(),
        encargadoUid: encargadoUser?.uid || '',
        encargadoNombre: encargadoUser?.nombre || '',
        activa: true,
      });
      setEditingSucursalId(undefined);
      setSucNombre('');
      setSucDireccion('');
      setSucTelefono('');
      setSucEncargadoUid('');
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingSucursal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white tracking-tight">
            Panel de Configuración y Administración
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Gestiona cuentas activas y atrasadas, alertas automáticas por correo, cargos de personal, tiendas y encargados.
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'cuentas', label: 'Cuentas Activas', icon: CreditCard },
            { id: 'alertas', label: 'Alertas Automáticas', icon: BellRing },
            { id: 'personal', label: 'Personal y Cargos', icon: Users },
            { id: 'tiendas', label: 'Tiendas y Encargados', icon: Store },
            { id: 'ticket', label: 'Encabezado Ticket', icon: Mail },
            { id: 'errores', label: `Registro de Errores (${errorLogs.length})`, icon: Bug },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all ${
                active
                  ? 'alquia-gold-btn'
                  : 'bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-[#C81E1E]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: CUENTAS ACTIVAS Y ATRASADAS */}
      {subTab === 'cuentas' && (
        <div className="space-y-6">
          {/* Créditos activos */}
          <section className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E] flex items-center justify-between">
              <h2 className="text-sm font-display font-bold">
                Créditos activos ({activeCreditos.length})
              </h2>
              <span className="text-xs text-[#EDD06D] font-bold">
                Solo Administrador puede aumentar pagos atrasados o eliminar cuentas
              </span>
            </div>

            {activeCreditos.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No hay créditos activos en este momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 uppercase text-[10.5px] border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Próximo pago</th>
                      <th className="px-4 py-3 text-right">Cuota</th>
                      <th className="px-4 py-3 text-right">Saldo pendiente</th>
                      <th className="px-4 py-3 text-right">Acciones Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {activeCreditos.map((c) => {
                      const { health, daysDiff } = getCreditHealth(c, today);
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-3 font-mono font-bold">{c.folio}</td>
                          <td className="px-4 py-3">
                            <div className="font-bold">{c.clienteNombre}</div>
                            <div className="text-[11px] text-zinc-500">{c.clienteTelefono}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div>{formatShortDate(c.proximaFechaPago)}</div>
                            {health === 'vencido' && (
                              <span className="text-[10px] font-bold text-[#C81E1E]">
                                Atrasado {Math.abs(daysDiff)} día(s)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num">
                            {formatMXN(c.montoPago)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num font-bold text-[#C81E1E]">
                            {formatMXN(c.saldoPendiente)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setIncreaseTarget({ tipo: 'credito', item: c });
                                  setIncSaldo('150');
                                  setIncNuevaCuota(String(c.montoPago));
                                  setIncMotivo('Recargo por atraso en fecha límite');
                                }}
                                className="alquia-gold-outline-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                              >
                                <TrendingUp className="w-3.5 h-3.5" />
                                Aumentar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    tipo: 'credito',
                                    id: c.id,
                                    folio: c.folio,
                                    clienteNombre: c.clienteNombre,
                                  })
                                }
                                aria-label={`Eliminar crédito ${c.folio}`}
                                className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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

          {/* Apartados vigentes */}
          <section className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h2 className="text-sm font-display font-bold">
                Apartados vigentes ({activeApartados.length})
              </h2>
            </div>

            {activeApartados.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No hay apartados vigentes en este momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 uppercase text-[10.5px] border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Fecha límite</th>
                      <th className="px-4 py-3 text-right">Saldo pendiente</th>
                      <th className="px-4 py-3 text-right">Acciones Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {activeApartados.map((a) => {
                      const { health, daysLeft } = getLayawayHealth(a, today);
                      return (
                        <tr key={a.id}>
                          <td className="px-4 py-3 font-mono font-bold">{a.folio}</td>
                          <td className="px-4 py-3">
                            <div className="font-bold">{a.clienteNombre}</div>
                            <div className="text-[11px] text-zinc-500">{a.clienteTelefono}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div>{formatShortDate(a.fechaLimite)}</div>
                            {health === 'vencido' && (
                              <span className="text-[10px] font-bold text-[#C81E1E]">
                                Vencido {Math.abs(daysLeft)} día(s)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num font-bold text-[#C81E1E]">
                            {formatMXN(a.saldoPendiente)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setIncreaseTarget({ tipo: 'apartado', item: a });
                                  setIncSaldo('150');
                                  setIncNuevaCuota('');
                                  setIncMotivo('Recargo por atraso en apartado');
                                }}
                                className="alquia-gold-outline-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                              >
                                <TrendingUp className="w-3.5 h-3.5" />
                                Aumentar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    tipo: 'apartado',
                                    id: a.id,
                                    folio: a.folio,
                                    clienteNombre: a.clienteNombre,
                                  })
                                }
                                aria-label={`Eliminar apartado ${a.folio}`}
                                className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
      )}

      {/* SUB-TAB 2: ALERTAS AUTOMÁTICAS Y CORREO */}
      {subTab === 'alertas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveConfig}
            className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 alquia-card space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-[#C81E1E]" />
                <h2 className="text-base font-display font-bold">
                  Monitor Automático de Vencimientos
                </h2>
              </div>
              <button
                type="button"
                disabled={runningAlerts}
                onClick={() => void handleRunAlertsNow()}
                className="alquia-gold-outline-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${runningAlerts ? 'animate-spin' : ''}`} />
                {runningAlerts ? 'Revisando...' : 'Ejecutar revisión ahora'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="al-correo" className="block text-xs font-bold mb-1">
                  Correo del Administrador para alertas *
                </label>
                <input
                  id="al-correo"
                  type="email"
                  required
                  value={correoAlertas}
                  onChange={(e) => setCorreoAlertas(e.target.value)}
                  placeholder="muebleriaalquia@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label htmlFor="al-dias" className="block text-xs font-bold mb-1">
                  Avisar con cuántos días de anticipación
                </label>
                <input
                  id="al-dias"
                  type="number"
                  min="0"
                  max="30"
                  value={diasAnticipacion}
                  onChange={(e) => setDiasAnticipacion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={alertasActivas}
                onChange={(e) => setAlertasActivas(e.target.checked)}
                className="rounded text-[#C81E1E]"
              />
              Activar monitoreo automático de fechas de vencimiento al abrir la aplicación
            </label>

            <div>
              <label htmlFor="al-asunto" className="block text-xs font-bold mb-1">
                Plantilla de asunto del correo
              </label>
              <input
                id="al-asunto"
                type="text"
                value={plantillaAsunto}
                onChange={(e) => setPlantillaAsunto(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
              />
            </div>

            <div>
              <label htmlFor="al-cuerpo" className="block text-xs font-bold mb-1">
                Plantilla preconfigurada del mensaje (variables: {'{{clienteNombre}}'}, {'{{montoPendiente}}'}, {'{{montoAPagar}}'}, {'{{folio}}'}, {'{{fechaLimite}}'}, {'{{estado}}'})
              </label>
              <textarea
                id="al-cuerpo"
                rows={5}
                value={plantillaCuerpo}
                onChange={(e) => setPlantillaCuerpo(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
              />
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Envío automático directo por correo (EmailJS opcional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={emailjsServiceId}
                  onChange={(e) => setEmailjsServiceId(e.target.value)}
                  placeholder="Service ID"
                  className="px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
                />
                <input
                  type="text"
                  value={emailjsTemplateId}
                  onChange={(e) => setEmailjsTemplateId(e.target.value)}
                  placeholder="Template ID"
                  className="px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
                />
                <input
                  type="text"
                  value={emailjsPublicKey}
                  onChange={(e) => setEmailjsPublicKey(e.target.value)}
                  placeholder="Public Key"
                  className="px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="alquia-gold-btn px-6 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {savingConfig ? 'Guardando...' : 'Guardar configuración de alertas'}
            </button>
          </form>

          {/* Historial de alertas detectadas */}
          <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-5 alquia-card space-y-3">
            <h3 className="text-sm font-display font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#C81E1E]" />
              Alertas detectadas ({alertas.length})
            </h3>
            {alertas.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                No hay alertas de vencimiento registradas aún.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto">
                {alertas.map((al) => {
                  const mailtoHref = `mailto:${encodeURIComponent(al.correoDestino || correoAlertas)}?subject=${encodeURIComponent(
                    al.asunto || `Alerta vencimiento ${al.clienteNombre}`
                  )}&body=${encodeURIComponent(
                    al.mensaje ||
                      `Cliente: ${al.clienteNombre}\nCuenta: ${al.operacionFolio}\nMonto pendiente: ${formatMXN(al.saldoPendiente ?? al.montoAPagar)}`
                  )}`;
                  return (
                    <div
                      key={al.id}
                      className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#111114] dark:text-white">
                          {al.clienteNombre} · {al.operacionFolio}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            al.tipoAlerta === 'por_vencer'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-[#C81E1E]'
                          }`}
                        >
                          {al.tipoAlerta === 'por_vencer' ? 'Por vencer' : 'Vencido'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        Pendiente: <strong className="font-mono-num">{formatMXN(al.saldoPendiente ?? al.montoAPagar)}</strong> · Límite: {formatShortDate(al.fechaLimite)}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-zinc-500">
                          {al.metodoEnvio === 'automatico_emailjs' ? 'Enviado por correo' : 'Listo para enviar'}
                        </span>
                        <a
                          href={mailtoHref}
                          className="alquia-gold-outline-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold"
                        >
                          <Mail className="w-3 h-3" />
                          Abrir correo
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 3: PERSONAL Y CARGOS (SOLO ADMINISTRADORES — NUNCA VISIBLE PARA COBRADORES) */}
      {user?.rol === 'admin' && subTab === 'personal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h2 className="text-sm font-display font-bold">
                Usuarios registrados ({usuarios.length})
              </h2>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {usuarios.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No hay usuarios registrados aún.
                </div>
              ) : (
                usuarios.map((u) => {
                  const storeName =
                    sucursales.find((s) => s.id === u.sucursalId)?.nombre || 'Sin tienda';
                  return (
                    <div
                      key={u.uid}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{u.nombre}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              u.rol === 'admin'
                                ? 'bg-[#C81E1E] text-white'
                                : 'bg-[#D4A329] text-[#111114]'
                            }`}
                          >
                            {u.rol === 'admin' ? 'Admin' : 'Cobrador'}
                          </span>
                          {!u.activo && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-200 text-zinc-700">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {u.correo} · Tienda: <strong>{storeName}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStaffUid(u.uid);
                          setStaffNombre(u.nombre);
                          setStaffCorreo(u.correo);
                          setStaffRol(u.rol);
                          setStaffSucursalId(u.sucursalId || '');
                          setStaffActivo(u.activo);
                        }}
                        className="alquia-gold-outline-btn px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      >
                        Editar cargo / tienda
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <form
            onSubmit={handleSaveStaff}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-5 alquia-card space-y-3.5"
          >
            <h3 className="text-sm font-display font-bold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#C81E1E]" />
              {staffUid ? 'Editar cargo y tienda del miembro' : 'Autorizar / editar usuario'}
            </h3>
            <div>
              <label className="block text-xs font-bold mb-1">UID de usuario *</label>
              <input
                type="text"
                required
                value={staffUid}
                onChange={(e) => setStaffUid(e.target.value)}
                placeholder="Selecciona un usuario de la lista o pega su UID"
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Nombre completo *</label>
              <input
                type="text"
                required
                value={staffNombre}
                onChange={(e) => setStaffNombre(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Correo electrónico *</label>
              <input
                type="email"
                required
                value={staffCorreo}
                onChange={(e) => setStaffCorreo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="staff-cargo" className="block text-xs font-bold mb-1">
                  Cargo *
                </label>
                <select
                  id="staff-cargo"
                  value={staffRol}
                  onChange={(e) => setStaffRol(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs font-bold"
                >
                  <option value="cobrador">Cobrador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label htmlFor="staff-tienda" className="block text-xs font-bold mb-1">
                  Tienda asignada
                </label>
                <select
                  id="staff-tienda"
                  value={staffSucursalId}
                  onChange={(e) => setStaffSucursalId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
                >
                  <option value="">Automática</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={staffActivo}
                onChange={(e) => setStaffActivo(e.target.checked)}
              />
              Usuario activo en el sistema
            </label>
            <button
              type="submit"
              disabled={savingStaff}
              className="alquia-gold-btn w-full py-2.5 rounded-xl text-xs font-extrabold"
            >
              {savingStaff ? 'Guardando...' : 'Guardar cargo y permisos'}
            </button>
          </form>
        </div>
      )}

      {/* SUB-TAB 4: TIENDAS, DIRECCIONES DE TICKET Y ENCARGADOS */}
      {subTab === 'tiendas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            {sucursales.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-4 alquia-card flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-xs">
                  <div className="font-display font-extrabold text-sm text-[#111114] dark:text-white flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#C81E1E]" />
                    {s.nombre}
                  </div>
                  <div className="text-zinc-600 dark:text-zinc-400">
                    Dirección (tickets): <strong>{s.direccion}</strong>
                  </div>
                  <div className="text-zinc-600 dark:text-zinc-400">
                    Encargado de tienda:{' '}
                    <strong className="text-[#C81E1E] dark:text-red-400">
                      {s.encargadoNombre || 'Sin asignar'}
                    </strong>
                    {s.telefono ? ` · Tel: ${s.telefono}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleEditSucursal(s)}
                  className="alquia-gold-outline-btn px-3 py-1.5 rounded-xl text-xs font-bold"
                >
                  Editar tienda / encargado
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSaveSucursal}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-5 alquia-card space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#C81E1E]" />
                {editingSucursalId ? 'Editar sucursal y encargado' : 'Nueva tienda / sucursal'}
              </h3>
              {editingSucursalId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSucursalId(undefined);
                    setSucNombre('');
                    setSucDireccion('');
                    setSucTelefono('');
                    setSucEncargadoUid('');
                  }}
                  className="text-xs text-[#C81E1E] font-bold"
                >
                  Nueva
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Nombre de la tienda *</label>
              <input
                type="text"
                required
                value={sucNombre}
                onChange={(e) => setSucNombre(e.target.value)}
                placeholder="Ej. Tienda 2 — Norte"
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">
                Dirección de la tienda (aparecerá en sus tickets y PDF) *
              </label>
              <input
                type="text"
                required
                value={sucDireccion}
                onChange={(e) => setSucDireccion(e.target.value)}
                placeholder="Ej. Av. Juárez #114, Apaseo el Alto, Gto."
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Teléfono</label>
              <input
                type="text"
                value={sucTelefono}
                onChange={(e) => setSucTelefono(e.target.value)}
                placeholder="(413) 166-0420"
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
              />
            </div>
            <div>
              <label htmlFor="suc-encargado" className="block text-xs font-bold mb-1">
                Encargado de tienda (aparece en los tickets)
              </label>
              <select
                id="suc-encargado"
                value={sucEncargadoUid}
                onChange={(e) => setSucEncargadoUid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-xs"
              >
                <option value="">-- Seleccionar miembro registrado --</option>
                {usuarios.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.nombre} ({u.rol === 'admin' ? 'Admin' : 'Cobrador'})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={savingSucursal}
              className="alquia-gold-btn w-full py-2.5 rounded-xl text-xs font-extrabold"
            >
              {savingSucursal ? 'Guardando...' : 'Guardar tienda y encargado'}
            </button>
          </form>
        </div>
      )}

      {/* SUB-TAB 5: ENCABEZADO DEL TICKET */}
      {subTab === 'ticket' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl">
          <form
            onSubmit={handleSaveConfig}
            className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 alquia-card space-y-4"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <Store className="w-5 h-5 text-[#C81E1E]" />
              <h2 className="text-base font-display font-bold">
                Datos generales del comprobante PDF y WhatsApp
              </h2>
            </div>

            <div>
              <label htmlFor="cfg-nombre" className="block text-xs font-bold mb-1">
                Nombre comercial
              </label>
              <input
                id="cfg-nombre"
                type="text"
                required
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
              />
            </div>

            <div>
              <label htmlFor="cfg-ubicacion" className="block text-xs font-bold mb-1">
                Dirección general (respaldo si una tienda no tiene dirección propia)
              </label>
              <input
                id="cfg-ubicacion"
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
              />
            </div>

            <div>
              <label htmlFor="cfg-telefono" className="block text-xs font-bold mb-1">
                Teléfono / WhatsApp de tienda
              </label>
              <input
                id="cfg-telefono"
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
              />
            </div>

            <div>
              <label htmlFor="cfg-mensaje" className="block text-xs font-bold mb-1">
                Mensaje al pie del comprobante
              </label>
              <textarea
                id="cfg-mensaje"
                rows={3}
                value={mensajeTicket}
                onChange={(e) => setMensajeTicket(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="alquia-gold-btn px-6 py-2.5 rounded-xl text-sm font-extrabold inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {savingConfig ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>

          {/* Vista previa en vivo */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 alquia-card flex flex-col items-center justify-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-3">
              Vista previa del comprobante PDF y WhatsApp
            </span>
            <div className="w-full max-w-[300px] bg-white text-black border border-dashed border-zinc-400 rounded-xl p-5 font-mono text-center text-[11px] space-y-1 shadow-inner">
              <img
                src="/alquia-ticket-logo.svg"
                alt="Logotipo de ticket Mueblería Alquia"
                className="h-14 w-auto mx-auto mb-2 object-contain"
              />
              <div className="font-bold text-xs uppercase tracking-wide">
                {nombreComercial || 'Mueblería Alquia'}
              </div>
              <div className="text-[10px]">
                {currentSucursal?.direccion || ubicacion}
              </div>
              {telefono && <div className="text-[10px]">Tel: {telefono}</div>}
              {currentSucursal?.encargadoNombre && (
                <div className="text-[10px] font-bold pt-1">
                  Encargado: {currentSucursal.encargadoNombre}
                </div>
              )}
              <div className="border-t border-dashed border-zinc-400 my-2.5 pt-2.5 text-[10px] text-zinc-600">
                {mensajeTicket}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: REGISTRO AUTOMÁTICO DE ERRORES */}
      {subTab === 'errores' && (
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 overflow-hidden alquia-card">
          <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-display font-bold flex items-center gap-2">
                <Bug className="w-4 h-4 text-[#EDD06D]" />
                Registro Automático de Errores ({errorLogs.length})
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Captura en tiempo real de fallos de red, base de datos, validaciones y ejecución sin detener el sistema.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const blob = new Blob([exportErrorLogsJSON()], {
                      type: 'application/json;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Registro_Errores_Alquia_${today}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    notify('Registro de errores exportado en JSON.');
                  } catch {
                    notify('No se pudo exportar el archivo JSON.', 'error');
                  }
                }}
                className="alquia-gold-btn px-3 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar JSON
              </button>
              {errorLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearErrorLogs();
                    notify('Registro de errores limpiado.');
                  }}
                  className="px-3 py-2 rounded-xl bg-red-900/60 hover:bg-[#C81E1E] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpiar registro
                </button>
              )}
            </div>
          </div>

          {errorLogs.length === 0 ? (
            <div className="p-10 text-center text-xs text-zinc-500">
              No se han registrado errores recientes. Todos los bloques de validación y protección están activos.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[540px] overflow-y-auto">
              {errorLogs.map((log) => (
                <div key={log.id} className="p-4 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                          log.severity === 'critical'
                            ? 'bg-[#C81E1E] text-white'
                            : log.severity === 'error'
                              ? 'bg-red-100 dark:bg-red-950/60 text-[#C81E1E] dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {log.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                        {log.source} · {log.action}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400">{log.id}</span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-500">
                      {formatDateTimeMX(log.timestamp)}
                    </span>
                  </div>
                  <p className="font-bold text-[#111114] dark:text-white">{log.userMessage}</p>
                  {log.message !== log.userMessage && (
                    <p className="font-mono text-[11px] text-zinc-500 break-all">
                      Detalle técnico: {log.message}
                    </p>
                  )}
                  {log.context && (
                    <p className="font-mono text-[10.5px] text-zinc-500 bg-zinc-50 dark:bg-zinc-900/70 rounded-lg px-2.5 py-1.5 break-all">
                      Contexto: {JSON.stringify(log.context)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Aumentar pago atrasado */}
      {increaseTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Aumentar pago atrasado"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h3 className="text-base font-display font-bold">
                  Aumentar pago · {increaseTarget.item.folio}
                </h3>
                <p className="text-xs text-zinc-300">{increaseTarget.item.clienteNombre}</p>
              </div>
              <button
                type="button"
                onClick={() => setIncreaseTarget(null)}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleApplyIncrease} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Aumento al saldo (MXN)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={incSaldo}
                  onChange={(e) => setIncSaldo(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                />
              </div>
              {increaseTarget.tipo === 'credito' && (
                <div>
                  <label className="block text-xs font-bold mb-1">Nueva cuota (opcional)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={incNuevaCuota}
                    onChange={(e) => setIncNuevaCuota(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold mb-1">Motivo *</label>
                <input
                  type="text"
                  required
                  value={incMotivo}
                  onChange={(e) => setIncMotivo(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIncreaseTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingInc}
                  className="alquia-gold-btn px-5 py-2 rounded-xl text-xs font-extrabold"
                >
                  {savingInc ? 'Aplicando...' : 'Aplicar aumento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar Cuenta */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminar cuenta"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#C81E1E]" />
                Eliminar {deleteTarget.tipo === 'credito' ? 'cuenta de crédito' : 'apartado'}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                ¿Deseas eliminar permanentemente{' '}
                <strong>
                  {deleteTarget.folio} ({deleteTarget.clienteNombre})
                </strong>
                ?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deletingAcc}
                  onClick={() => void handleConfirmDeleteAccount()}
                  className="alquia-red-btn px-5 py-2 rounded-xl text-xs font-extrabold"
                >
                  {deletingAcc ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
