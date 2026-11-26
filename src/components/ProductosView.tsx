import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Power, Search, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Producto } from '../types/pos';
import { formatFriendlyErrorMessage } from '../utils/errorHandler';
import { formatMXN, getProductStoreAvailability } from '../utils/finance';

export function ProductosView() {
  const {
    user,
    productos,
    proveedores,
    sucursales,
    inventarioSucursales,
    activeSucursalId,
    currentSucursal,
    saveProducto,
    deleteProducto,
    toggleProductoActivo,
    notify,
  } = useStore();
  const isAdmin = user?.rol === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'activos' | 'inactivos'>('activos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [sku, setSku] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Salas');
  const [marca, setMarca] = useState('');
  const [precioContado, setPrecioContado] = useState('');
  const [precioCredito, setPrecioCredito] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [stockDisponible, setStockDisponible] = useState('1');
  const [stockMinimo, setStockMinimo] = useState('2');
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id || '');

  const openCreate = () => {
    setEditing(null);
    setSku('');
    setNombre('');
    setCategoria('Salas');
    setMarca('');
    setPrecioContado('');
    setPrecioCredito('');
    setCostoUnitario('');
    setStockDisponible('2');
    setStockMinimo('2');
    setProveedorId(proveedores[0]?.id || '');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (p: Producto) => {
    if (!isAdmin) return;
    const avail = getProductStoreAvailability({
      producto: p,
      inventarioSucursales,
      sucursales,
      currentSucursalId: activeSucursalId,
    });
    setEditing(p);
    setSku(p.sku);
    setNombre(p.nombre);
    setCategoria(p.categoria);
    setMarca(p.marca);
    setPrecioContado(String(p.precioContado));
    setPrecioCredito(String(p.precioCredito));
    setCostoUnitario(String(p.costoUnitario));
    setStockDisponible(String(avail.ownStockDisponible));
    setStockMinimo(String(avail.ownStockMinimo));
    setProveedorId(p.proveedorId || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (sku.trim().length < 2 || nombre.trim().length < 2) {
      setFormError('SKU y nombre del producto son obligatorios.');
      return;
    }
    const pCont = Number(precioContado);
    const pCred = Number(precioCredito);
    const pCost = Number(costoUnitario);
    if (pCont <= 0 || pCred <= 0 || pCost < 0) {
      setFormError('Ingresa precios de contado, crédito y costo unitario válidos.');
      return;
    }

    setSaving(true);
    try {
      await saveProducto(
        {
          sku,
          nombre,
          categoria,
          marca,
          precioContado: pCont,
          precioCredito: pCred,
          costoUnitario: pCost,
          stockDisponible: Number(stockDisponible) || 0,
          stockMinimo: Number(stockMinimo) || 1,
          proveedorId,
          activo: editing ? editing.activo : true,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      setFormError(formatFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProducto(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productos
      .filter((p) => {
        if (statusFilter === 'activos' && !p.activo) return false;
        if (statusFilter === 'inactivos' && p.activo) return false;
        if (!term) return true;
        return (
          p.nombre.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          p.categoria.toLowerCase().includes(term) ||
          p.marca.toLowerCase().includes(term)
        );
      })
      .map((p) => ({
        producto: p,
        avail: getProductStoreAvailability({
          producto: p,
          inventarioSucursales,
          sucursales,
          currentSucursalId: activeSucursalId,
        }),
      }));
  }, [productos, search, statusFilter, inventarioSucursales, sucursales, activeSucursalId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#111114] dark:text-white">
            Catálogo de Productos
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            Catálogo e inventario privado de <strong>{currentSucursal?.nombre || 'Tienda Principal'}</strong>. Solo el Administrador puede editar precios o eliminar productos.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl alquia-gold-btn text-xs font-bold self-start whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-4 alquia-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Buscar producto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por SKU, nombre, categoría o marca..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 focus:border-[#C81E1E] text-sm text-[#111114] dark:text-white placeholder:text-neutral-400 outline-none"
          />
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 self-start">
          {(['activos', 'inactivos', 'todos'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-[#C81E1E] text-white'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-[#111114] dark:hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 overflow-hidden alquia-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-[#0B0B0D]">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Producto / Disponibilidad</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4 text-right">Contado</th>
                <th className="py-3 px-4 text-right">Crédito / Ap.</th>
                {isAdmin && <th className="py-3 px-4 text-right">Costo</th>}
                <th className="py-3 px-4 text-right">En tu tienda</th>
                <th className="py-3 px-4">Estado</th>
                {isAdmin && <th className="py-3 px-4 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 7} className="py-10 px-4 text-center text-xs text-neutral-600 dark:text-neutral-400">
                    No hay productos registrados todavía. Haz clic en &ldquo;Nuevo producto&rdquo; para agregar el primero.
                  </td>
                </tr>
              ) : (
                filtered.map(({ producto: p, avail }) => (
                  <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-[#C81E1E] dark:text-red-400">
                      {p.sku}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[#111114] dark:text-white">{p.nombre}</p>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                        {p.marca || 'Sin marca'} ·{' '}
                        <span className={avail.ownStockDisponible <= 0 ? 'text-[#C81E1E] font-bold' : ''}>
                          {avail.statusMessage}
                        </span>
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400">{p.categoria}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#111114] dark:text-white tabular-nums">
                      {formatMXN(p.precioContado)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#C81E1E] dark:text-red-400 tabular-nums">
                      {formatMXN(p.precioCredito)}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right font-mono text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
                        {formatMXN(p.costoUnitario)}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                      <span
                        className={
                          avail.ownStockDisponible <= avail.ownStockMinimo
                            ? 'font-bold text-[#C81E1E] dark:text-red-400'
                            : 'font-bold text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {avail.ownStockDisponible}
                      </span>{' '}
                      <span className="text-neutral-500">/ {avail.ownStockReservado} res.</span>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          p.activo
                            ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                            : 'font-semibold text-neutral-500'
                        }
                      >
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            aria-label={`Editar ${p.nombre}`}
                            className="p-2 rounded-lg alquia-gold-outline-btn"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void toggleProductoActivo(p.id).catch((err) =>
                                notify(formatFriendlyErrorMessage(err), 'error')
                              )
                            }
                            aria-label={p.activo ? `Desactivar ${p.nombre}` : `Activar ${p.nombre}`}
                            className="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            aria-label={`Eliminar ${p.nombre}`}
                            className="p-2 rounded-lg text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Crear / Editar Producto */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prod-modal-title"
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-6 alquia-card space-y-4 my-auto"
          >
            <div className="flex items-center justify-between">
              <h2 id="prod-modal-title" className="font-display font-bold text-lg text-[#111114] dark:text-white">
                {editing ? `Editar ${editing.sku}` : 'Nuevo mueble / artículo'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar formulario de producto"
                className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="prod-sku" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  SKU / Código *
                </label>
                <input
                  id="prod-sku"
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Ej. SAL-MOD-09"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="prod-cat" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Categoría *
                </label>
                <select
                  id="prod-cat"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                >
                  {['Salas', 'Comedores', 'Recámaras', 'Colchones', 'Roperos', 'Cocina', 'Electrodomésticos', 'Decoración'].map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="prod-nombre" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Nombre del producto *
              </label>
              <input
                id="prod-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Comedor Cedro 4 Sillas"
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="prod-marca" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Marca / Línea
                </label>
                <input
                  id="prod-marca"
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ej. Alquia Select"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="prod-prov" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Proveedor principal
                </label>
                <select
                  id="prod-prov"
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                >
                  <option value="">Sin asignar</option>
                  {proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="prod-contado" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Precio Contado *
                </label>
                <input
                  id="prod-contado"
                  type="number"
                  min="1"
                  value={precioContado}
                  onChange={(e) => setPrecioContado(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="prod-credito" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Precio Crédito *
                </label>
                <input
                  id="prod-credito"
                  type="number"
                  min="1"
                  value={precioCredito}
                  onChange={(e) => setPrecioCredito(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="prod-costo" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Costo Unitario *
                </label>
                <input
                  id="prod-costo"
                  type="number"
                  min="0"
                  value={costoUnitario}
                  onChange={(e) => setCostoUnitario(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="prod-stock" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Stock inicial en tu tienda
                </label>
                <input
                  id="prod-stock"
                  type="number"
                  min="0"
                  value={stockDisponible}
                  onChange={(e) => setStockDisponible(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="prod-min" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Stock mínimo (alerta)
                </label>
                <input
                  id="prod-min"
                  type="number"
                  min="0"
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white"
                />
              </div>
            </div>

            {formError && (
              <p role="alert" className="text-xs text-[#C81E1E] dark:text-red-400 font-medium">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl alquia-gold-btn text-xs font-bold disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminar Producto (Solo Admin) */}
      {deleteTarget && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminar producto"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <h3 className="text-base font-display font-bold flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-[#C81E1E]" />
                Eliminar producto
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                ¿Deseas eliminar definitivamente{' '}
                <strong>
                  {deleteTarget.nombre} ({deleteTarget.sku})
                </strong>
                ? Esta acción solo está permitida para el Administrador.
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
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                  className="alquia-red-btn px-5 py-2 rounded-xl text-xs font-extrabold disabled:opacity-60"
                >
                  {deleting ? 'Eliminando...' : 'Eliminar producto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
