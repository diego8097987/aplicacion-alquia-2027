import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Edit3,
  History,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Cliente } from '../types/pos';
import { formatFriendlyErrorMessage } from '../utils/errorHandler';
import { buildWhatsAppLink, formatMXN, formatShortDate } from '../utils/finance';

export function ClientesView() {
  const {
    user,
    clientes,
    creditos,
    apartados,
    abonos,
    addCliente,
    updateCliente,
    deleteCliente,
    clearAllClientes,
    notify,
  } = useStore();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referencias, setReferencias] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal: Historial de pagos por persona (Al día vs Atrasados)
  const [historyClient, setHistoryClient] = useState<Cliente | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.telefono.includes(q) ||
        c.direccion.toLowerCase().includes(q)
    );
  }, [clientes, search]);

  const statsByClient = useMemo(() => {
    const map = new Map<
      string,
      { saldoPendiente: number; alDia: number; atrasados: number; totalAbonos: number }
    >();
    creditos.forEach((c) => {
      if (c.estado !== 'activo') return;
      const cur = map.get(c.clienteId) || {
        saldoPendiente: 0,
        alDia: 0,
        atrasados: 0,
        totalAbonos: 0,
      };
      cur.saldoPendiente += c.saldoPendiente;
      map.set(c.clienteId, cur);
    });
    apartados.forEach((a) => {
      if (a.estado !== 'vigente') return;
      const cur = map.get(a.clienteId) || {
        saldoPendiente: 0,
        alDia: 0,
        atrasados: 0,
        totalAbonos: 0,
      };
      cur.saldoPendiente += a.saldoPendiente;
      map.set(a.clienteId, cur);
    });
    abonos.forEach((ab) => {
      const cur = map.get(ab.clienteId) || {
        saldoPendiente: 0,
        alDia: 0,
        atrasados: 0,
        totalAbonos: 0,
      };
      cur.totalAbonos += 1;
      if (ab.estadoPuntualidad === 'atrasado') cur.atrasados += 1;
      else cur.alDia += 1;
      map.set(ab.clienteId, cur);
    });
    return map;
  }, [creditos, apartados, abonos]);

  const historyAbonos = useMemo(
    () => (historyClient ? abonos.filter((ab) => ab.clienteId === historyClient.id) : []),
    [abonos, historyClient]
  );

  const openNew = () => {
    setEditing(null);
    setNombre('');
    setTelefono('');
    setDireccion('');
    setReferencias('');
    setModalOpen(true);
  };

  const openEdit = (cli: Cliente) => {
    setEditing(cli);
    setNombre(cli.nombre);
    setTelefono(cli.telefono);
    setDireccion(cli.direccion);
    setReferencias(cli.referencias);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateCliente(editing.id, { nombre, telefono, direccion, referencias });
      } else {
        await addCliente({ nombre, telefono, direccion, referencias });
      }
      setModalOpen(false);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white tracking-tight">
            Directorio de Clientes
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            WhatsApp de contacto, saldos activos e historial completo de pagos al día y atrasados por persona.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user?.rol === 'admin' && clientes.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="alquia-red-btn inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar directorio
            </button>
          )}
          <button
            type="button"
            onClick={openNew}
            className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
          >
            <Plus className="w-4 h-4" />
            Nuevo cliente
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, WhatsApp o dirección..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
        />
      </div>

      {/* Lista de clientes */}
      <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 alquia-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              No hay clientes registrados todavía.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
            >
              <Plus className="w-4 h-4" />
              Registrar primer cliente
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#111114] text-white uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Historial de puntualidad</th>
                  <th className="px-4 py-3 text-right">Saldo activo</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filtered.map((cli) => {
                  const st = statsByClient.get(cli.id) || {
                    saldoPendiente: 0,
                    alDia: 0,
                    atrasados: 0,
                    totalAbonos: 0,
                  };
                  return (
                    <tr key={cli.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-[#111114] dark:text-white">{cli.nombre}</div>
                        {cli.direccion && (
                          <div className="text-[11px] text-zinc-500">{cli.direccion}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={buildWhatsAppLink(cli.telefono, `Hola ${cli.nombre}, te saludamos de Mueblería Alquia.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {cli.telefono}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 font-bold">
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {st.alDia} al día
                          </span>
                          <span className="inline-flex items-center gap-1 text-[#C81E1E] dark:text-red-400">
                            <Clock className="w-3.5 h-3.5" />
                            {st.atrasados} atrasado(s)
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num">
                        <div className="font-bold text-[#C81E1E] dark:text-red-400">
                          {formatMXN(st.saldoPendiente)}
                        </div>
                        {cli.saldoAFavor > 0 && (
                          <div className="text-[10px] text-emerald-600 font-semibold">
                            A favor: {formatMXN(cli.saldoAFavor)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setHistoryClient(cli)}
                            className="alquia-gold-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold"
                          >
                            <History className="w-3.5 h-3.5" />
                            Historial
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(cli)}
                            aria-label={`Editar ${cli.nombre}`}
                            className="alquia-gold-outline-btn p-1.5 rounded-lg"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {user?.rol === 'admin' && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(cli)}
                              aria-label={`Eliminar ${cli.nombre}`}
                              className="p-1.5 rounded-lg text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40"
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
      </div>

      {/* MODAL: HISTORIAL DE PAGOS POR PERSONA */}
      {historyClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Historial de pagos del cliente"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h2 className="text-base font-display font-bold">
                  Historial de pagos · {historyClient.nombre}
                </h2>
                <p className="text-xs text-zinc-300">WhatsApp: {historyClient.telefono}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryClient(null)}
                aria-label="Cerrar historial"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Pagos al día
                  </div>
                  <div className="text-2xl font-display font-extrabold font-mono-num text-emerald-700 dark:text-emerald-400">
                    {historyAbonos.filter((a) => a.estadoPuntualidad !== 'atrasado').length}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                  <div className="text-xs font-bold text-[#C81E1E] dark:text-red-400">
                    Pagos atrasados
                  </div>
                  <div className="text-2xl font-display font-extrabold font-mono-num text-[#C81E1E] dark:text-red-400">
                    {historyAbonos.filter((a) => a.estadoPuntualidad === 'atrasado').length}
                  </div>
                </div>
              </div>

              {historyAbonos.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">
                  Esta persona aún no tiene abonos registrados.
                </p>
              ) : (
                <div className="space-y-2">
                  {historyAbonos.map((ab) => (
                    <div
                      key={ab.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{ab.folio}</span>
                          <span className="text-zinc-500">Cuenta {ab.operacionFolio}</span>
                          {ab.estadoPuntualidad === 'atrasado' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-[#C81E1E]">
                              ATRASADO ({ab.diasAtraso}d)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              AL DÍA
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          Pagado el {formatShortDate(ab.creadoEn)}
                          {ab.fechaProgramada
                            ? ` (programado: ${formatShortDate(ab.fechaProgramada)})`
                            : ''}{' '}
                          · {ab.metodoPago.toUpperCase()}
                        </div>
                      </div>
                      <div className="text-right font-mono-num">
                        <div className="font-extrabold text-emerald-600">
                          +{formatMXN(ab.monto)}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Saldo: {formatMXN(ab.saldoNuevo)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ALTA / EDICIÓN CLIENTE */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Editar cliente' : 'Nuevo cliente'}
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold">
                {editing ? 'Editar cliente' : 'Registrar nuevo cliente'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar formulario"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">Nombre completo *</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-[#C81E1E] dark:text-red-400">
                  Número de WhatsApp (10 dígitos) *
                </label>
                <input
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="4131234567"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Dirección</label>
                <input
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Referencias</label>
                <input
                  type="text"
                  value={referencias}
                  onChange={(e) => setReferencias(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="alquia-gold-btn px-5 py-2 rounded-xl text-xs font-extrabold"
                >
                  {saving ? 'Guardando...' : 'Guardar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete single client */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
            <h3 className="text-base font-display font-bold text-[#C81E1E]">
              ¿Eliminar a {deleteTarget.nombre}?
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Esta acción elimina al cliente permanentemente (no se eliminan clientes con créditos o apartados activos).
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
                onClick={() => {
                  void deleteCliente(deleteTarget.id)
                    .then(() => setDeleteTarget(null))
                    .catch((err) => notify(formatFriendlyErrorMessage(err), 'error'));
                }}
                className="alquia-red-btn px-4 py-2 rounded-xl text-xs font-bold"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clear all */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
            <h3 className="text-base font-display font-bold text-[#C81E1E]">
              ¿Limpiar directorio de clientes?
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Se eliminarán todos los clientes sin créditos ni apartados activos.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void clearAllClientes()
                    .then(() => setConfirmClearAll(false))
                    .catch((err) => notify(formatFriendlyErrorMessage(err), 'error'));
                }}
                className="alquia-red-btn px-4 py-2 rounded-xl text-xs font-bold"
              >
                Confirmar limpieza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
