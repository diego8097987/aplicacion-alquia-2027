import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  FileDown,
  History,
  MapPin,
  Plus,
  Save,
  Search,
  SlidersHorizontal,
  Store,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Producto } from '../types/pos';
import { formatFriendlyErrorMessage } from '../utils/errorHandler';
import { formatMXN, formatShortDate, getProductStoreAvailability } from '../utils/finance';
import { downloadInventarioPDF } from '../utils/pdfTicket';

const CATEGORIAS_BASE = [
  'Salas',
  'Recámaras',
  'Comedores',
  'Colchones',
  'Cocinas',
  'Muebles de TV',
  'Clósets y Roperos',
  'Electrodomésticos',
  'Accesorios',
];

export function InventarioView() {
  const {
    user,
    configuracion,
    sucursales,
    inventarioSucursales,
    activeSucursalId,
    setActiveSucursalId,
    currentSucursal,
    productos,
    proveedores,
    movimientos,
    registrarAjusteInventario,
    deleteMovimientoInventario,
    saveProducto,
    deleteProducto,
    updateOwnSucursalAddress,
    notify,
  } = useStore();

  const isAdmin = user?.rol === 'admin';

  const [tab, setTab] = useState<'stock' | 'kardex'>('stock');
  const [search, setSearch] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Dirección privada de esta tienda (solo para tickets)
  const [editingAddress, setEditingAddress] = useState(false);
  const [branchAddress, setBranchAddress] = useState(currentSucursal?.direccion || '');
  const [branchPhone, setBranchPhone] = useState(currentSucursal?.telefono || '');
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    setBranchAddress(currentSucursal?.direccion || '');
    setBranchPhone(currentSucursal?.telefono || '');
  }, [currentSucursal]);

  // Modal: Ajuste manual de stock (para su propia tienda)
  const [adjustProdId, setAdjustProdId] = useState<string | null>(null);
  const [delta, setDelta] = useState('1');
  const [motivo, setMotivo] = useState('Conteo físico en tienda');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Modal: Confirmar eliminar producto (Solo Admin)
  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null);
  const [deletingProd, setDeletingProd] = useState(false);
  const [deletingMovId, setDeletingMovId] = useState<string | null>(null);

  // Modal: Agregar producto directamente desde Inventario (Todos los usuarios)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [sku, setSku] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Salas');
  const [marca, setMarca] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [precioContado, setPrecioContado] = useState('');
  const [precioCredito, setPrecioCredito] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [stockDisponible, setStockDisponible] = useState('1');
  const [stockMinimo, setStockMinimo] = useState('2');
  const [submittingProd, setSubmittingProd] = useState(false);

  const productsWithAvailability = useMemo(
    () =>
      productos.map((p) => ({
        producto: p,
        avail: getProductStoreAvailability({
          producto: p,
          inventarioSucursales,
          sucursales,
          currentSucursalId: activeSucursalId,
        }),
      })),
    [productos, inventarioSucursales, sucursales, activeSucursalId]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productsWithAvailability.filter(({ producto: p, avail }) => {
      if (onlyLowStock && avail.ownStockDisponible > avail.ownStockMinimo) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
      );
    });
  }, [productsWithAvailability, search, onlyLowStock]);

  const lowStockCount = useMemo(
    () =>
      productsWithAvailability.filter(
        ({ producto: p, avail }) => p.activo && avail.ownStockDisponible <= avail.ownStockMinimo
      ).length,
    [productsWithAvailability]
  );

  const totalUnidades = useMemo(
    () => productsWithAvailability.reduce((acc, r) => acc + r.avail.ownStockDisponible, 0),
    [productsWithAvailability]
  );
  const totalReservadas = useMemo(
    () => productsWithAvailability.reduce((acc, r) => acc + r.avail.ownStockReservado, 0),
    [productsWithAvailability]
  );
  const valorInventario = useMemo(
    () =>
      productsWithAvailability.reduce(
        (acc, r) =>
          acc + r.producto.costoUnitario * (r.avail.ownStockDisponible + r.avail.ownStockReservado),
        0
      ),
    [productsWithAvailability]
  );

  const adjustEntry = productsWithAvailability.find((r) => r.producto.id === adjustProdId) || null;

  const handleSaveBranchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAddress(true);
    try {
      await updateOwnSucursalAddress({
        direccion: branchAddress,
        telefono: branchPhone,
      });
      setEditingAddress(false);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDownloadInventarioPDF = () => {
    try {
      downloadInventarioPDF({
        productos,
        inventarioSucursales,
        sucursales,
        currentSucursalId: activeSucursalId,
        config: configuracion,
        generadoPorNombre: user?.nombre || 'Personal Alquia',
      });
      notify('Reporte de inventario en PDF descargado.');
    } catch {
      notify('No se pudo generar el PDF de inventario.', 'error');
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustEntry) return;
    const numDelta = Number(delta);
    if (!Number.isFinite(numDelta) || numDelta === 0) {
      notify('Indica una cantidad distinta de 0 (positiva para entrada, negativa para salida).', 'error');
      return;
    }
    setSubmittingAdjust(true);
    try {
      await registrarAjusteInventario({
        productoId: adjustEntry.producto.id,
        delta: Math.trunc(numDelta),
        motivo,
        sucursalId: activeSucursalId,
      });
      setAdjustProdId(null);
      setDelta('1');
      setMotivo('Conteo físico en tienda');
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setDeletingProd(true);
    try {
      await deleteProducto(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingProd(false);
    }
  };

  const handleDeleteMovimiento = async (movId: string) => {
    setDeletingMovId(movId);
    try {
      await deleteMovimientoInventario(movId);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setDeletingMovId(null);
    }
  };

  const resetProductForm = () => {
    setSku('');
    setNombre('');
    setCategoria('Salas');
    setMarca('');
    setProveedorId('');
    setPrecioContado('');
    setPrecioCredito('');
    setCostoUnitario('');
    setStockDisponible('1');
    setStockMinimo('2');
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingProd(true);
    try {
      await saveProducto({
        sku: sku.trim() || `PROD-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        nombre,
        categoria,
        marca,
        proveedorId,
        precioContado: Number(precioContado) || 0,
        precioCredito: Number(precioCredito) || Number(precioContado) || 0,
        costoUnitario: Number(costoUnitario) || 0,
        stockDisponible: Number(stockDisponible) || 0,
        stockMinimo: Number(stockMinimo) || 1,
        activo: true,
      });
      resetProductForm();
      setAddModalOpen(false);
    } catch (err) {
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSubmittingProd(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#111114] dark:text-white tracking-tight">
            Inventario Privado de Tienda
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Base de datos privada de existencias exclusiva de tu tienda y descarga en PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadInventarioPDF}
            className="alquia-gold-outline-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
          >
            <FileDown className="w-4 h-4" />
            Descargar Inventario PDF
          </button>
          <button
            type="button"
            onClick={() => {
              resetProductForm();
              setAddModalOpen(true);
            }}
            className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
          >
            <Plus className="w-4 h-4" />
            Agregar producto al inventario
          </button>
        </div>
      </div>

      {/* Banner de Tienda Activa, Encargado y Dirección exclusiva para tickets */}
      <section className="rounded-2xl bg-[#111114] text-white border-l-4 border-[#C81E1E] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-display font-extrabold text-[#EDD06D]">
                <Store className="w-4 h-4" />
                {currentSucursal?.nombre || 'Tienda Principal'}
              </span>
              {currentSucursal?.encargadoNombre && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white/10 text-[11px] font-bold text-zinc-200">
                  <UserCheck className="w-3.5 h-3.5 text-[#EDD06D]" />
                  Encargado: {currentSucursal.encargadoNombre}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-300">
              <MapPin className="w-3.5 h-3.5 text-[#C81E1E] shrink-0" />
              <span>
                Dirección para tickets:{' '}
                <strong>{currentSucursal?.direccion || configuracion.ubicacion}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && sucursales.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="inv-sucursal-select" className="text-[11px] font-bold text-zinc-400">
                  Ver tienda:
                </label>
                <select
                  id="inv-sucursal-select"
                  value={activeSucursalId}
                  onChange={(e) => setActiveSucursalId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold text-white"
                >
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => setEditingAddress((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#EDD06D] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <MapPin className="w-3.5 h-3.5" />
              {editingAddress ? 'Cerrar' : 'Editar dirección para tickets'}
            </button>
          </div>
        </div>

        {editingAddress && (
          <form
            onSubmit={handleSaveBranchAddress}
            className="pt-3 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-6">
              <label htmlFor="branch-dir-input" className="block text-[11px] font-bold text-zinc-300 mb-1">
                Dirección de esta tienda (aparecerá solo en los tickets y PDF)
              </label>
              <input
                id="branch-dir-input"
                type="text"
                required
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                placeholder="Calle, número, colonia, municipio..."
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="branch-tel-input" className="block text-[11px] font-bold text-zinc-300 mb-1">
                Teléfono sucursal
              </label>
              <input
                id="branch-tel-input"
                type="text"
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
                placeholder="(413) 166-0420"
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={savingAddress}
                className="alquia-gold-btn w-full py-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingAddress ? 'Guardando...' : 'Guardar dirección'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* KPIs de esta tienda */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-4 alquia-card">
          <div className="text-xs font-semibold text-zinc-500">Unidades en esta tienda</div>
          <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
            {totalUnidades}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 p-4 alquia-card">
          <div className="text-xs font-semibold text-zinc-500">Apartadas aquí</div>
          <div className="text-2xl font-display font-extrabold font-mono-num mt-1">
            {totalReservadas}
          </div>
        </div>
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-4 alquia-card">
          <div className="text-xs font-semibold text-[#C81E1E] dark:text-red-400">
            Stock bajo / sin stock
          </div>
          <div className="text-2xl font-display font-extrabold font-mono-num text-[#C81E1E] dark:text-red-400 mt-1">
            {lowStockCount}
          </div>
        </div>
        <div className="rounded-2xl bg-[#111114] text-white border border-zinc-800 p-4 alquia-card">
          <div className="text-xs font-semibold text-zinc-400">Valor en tienda (costo)</div>
          <div className="text-2xl font-display font-extrabold font-mono-num text-[#EDD06D] mt-1">
            {formatMXN(valorInventario)}
          </div>
        </div>
      </div>

      {/* Tabs + Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('stock')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${
              tab === 'stock'
                ? 'alquia-gold-btn'
                : 'bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Existencias ({productos.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('kardex')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${
              tab === 'kardex'
                ? 'alquia-gold-btn'
                : 'bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <History className="w-4 h-4" />
            Kardex ({movimientos.length})
          </button>
        </div>

        {tab === 'stock' && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setOnlyLowStock((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${
                onlyLowStock
                  ? 'bg-[#C81E1E] text-white border-[#991B1B]'
                  : 'bg-white dark:bg-[#141418] border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Solo stock bajo
            </button>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar SKU o mueble..."
                className="pl-9 pr-3.5 py-2 rounded-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabla de existencias con disponibilidad por tienda */}
      {tab === 'stock' && (
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 alquia-card overflow-hidden">
          {filteredProducts.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Boxes className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                No hay productos en inventario todavía.
              </p>
              <button
                type="button"
                onClick={() => {
                  resetProductForm();
                  setAddModalOpen(true);
                }}
                className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold"
              >
                <Plus className="w-4 h-4" />
                Agregar primer producto
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111114] text-white uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Contado / Crédito</th>
                    <th className="px-4 py-3 text-center">En tu tienda</th>
                    <th className="px-4 py-3 text-center">Apartado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredProducts.map(({ producto: p, avail }) => {
                    const isLow = avail.ownStockDisponible <= avail.ownStockMinimo;
                    return (
                      <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="px-4 py-3 font-mono font-bold text-zinc-700 dark:text-zinc-300">
                          {p.sku}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#111114] dark:text-white">{p.nombre}</div>
                          {p.marca && <div className="text-[11px] text-zinc-500">{p.marca}</div>}
                          <div
                            className={`mt-1 text-[11px] font-semibold ${
                              avail.ownStockDisponible <= 0
                                ? 'text-[#C81E1E] dark:text-red-400'
                                : 'text-zinc-500'
                            }`}
                          >
                            {avail.statusMessage}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.categoria}</td>
                        <td className="px-4 py-3 text-right font-mono-num">
                          <div className="font-bold">{formatMXN(p.precioContado)}</div>
                          <div className="text-[11px] text-zinc-500">
                            Créd: {formatMXN(p.precioCredito)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono-num font-bold ${
                              isLow
                                ? 'bg-red-100 text-[#C81E1E] dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            }`}
                          >
                            {avail.ownStockDisponible}
                            {isLow && <AlertTriangle className="w-3 h-3" />}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono-num font-semibold">
                          {avail.ownStockReservado}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustProdId(p.id);
                                setDelta('1');
                                setMotivo('Entrada de mercancía');
                              }}
                              className="alquia-gold-outline-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              Ajustar stock
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(p)}
                                aria-label={`Eliminar producto ${p.nombre}`}
                                className="p-1.5 rounded-lg text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50"
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
      )}

      {/* Kardex */}
      {tab === 'kardex' && (
        <div className="rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 alquia-card overflow-hidden">
          {movimientos.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              Aún no hay movimientos registrados en el kardex.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111114] text-white uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tienda</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-center">Cantidad</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3">Motivo / Folio</th>
                    {isAdmin && <th className="px-4 py-3 text-right">Acción</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {movimientos.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-3 whitespace-nowrap">{formatShortDate(m.creadoEn)}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {m.sucursalNombre || 'Principal'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold">{m.productoNombre}</div>
                        <div className="font-mono text-[10px] text-zinc-500">{m.productoSku}</div>
                      </td>
                      <td className="px-4 py-3 uppercase font-bold text-[11px]">{m.tipo}</td>
                      <td className="px-4 py-3 text-center font-mono-num font-bold">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            m.cantidad >= 0 ? 'text-emerald-600' : 'text-[#C81E1E]'
                          }`}
                        >
                          {m.cantidad >= 0 ? (
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                          )}
                          {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono-num">
                        {m.stockAnterior} → <strong>{m.stockNuevo}</strong>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {m.motivo}{' '}
                        {m.referenciaFolio && (
                          <span className="font-mono font-bold text-[#111114] dark:text-white">
                            ({m.referenciaFolio})
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={deletingMovId === m.id}
                            onClick={() => void handleDeleteMovimiento(m.id)}
                            aria-label={`Eliminar movimiento ${m.productoNombre} ${m.referenciaFolio || ''}`.trim()}
                            title="Eliminar movimiento del kardex"
                            className="p-1.5 rounded-lg text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 disabled:opacity-50"
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
        </div>
      )}

      {/* MODAL: AGREGAR PRODUCTO DIRECTAMENTE AL INVENTARIO (TODOS LOS USUARIOS) */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Agregar producto al inventario"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h2 className="text-base font-display font-bold">Agregar producto al inventario</h2>
                <p className="text-xs text-zinc-300">
                  El stock inicial quedará asignado a{' '}
                  <strong>{currentSucursal?.nombre || 'tu tienda'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                aria-label="Cerrar modal de producto"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inv-sku" className="block text-xs font-bold mb-1">
                    SKU / Código *
                  </label>
                  <input
                    id="inv-sku"
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ej. SALA-001"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="inv-nombre" className="block text-xs font-bold mb-1">
                    Nombre del producto *
                  </label>
                  <input
                    id="inv-nombre"
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Sala Esquinera Roma 3 piezas"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inv-cat" className="block text-xs font-bold mb-1">
                    Categoría *
                  </label>
                  <select
                    id="inv-cat"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                  >
                    {CATEGORIAS_BASE.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="inv-marca" className="block text-xs font-bold mb-1">
                    Marca / Línea
                  </label>
                  <input
                    id="inv-marca"
                    type="text"
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    placeholder="Ej. Alquia Home"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="inv-prov" className="block text-xs font-bold mb-1">
                    Proveedor
                  </label>
                  <select
                    id="inv-prov"
                    value={proveedorId}
                    onChange={(e) => setProveedorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                  >
                    <option value="">Sin proveedor</option>
                    {proveedores.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inv-contado" className="block text-xs font-bold mb-1">
                    Precio Contado (MXN) *
                  </label>
                  <input
                    id="inv-contado"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={precioContado}
                    onChange={(e) => {
                      setPrecioContado(e.target.value);
                      if (!precioCredito) setPrecioCredito(e.target.value);
                    }}
                    placeholder="8500"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label htmlFor="inv-credito" className="block text-xs font-bold mb-1">
                    Precio Crédito/Apartado *
                  </label>
                  <input
                    id="inv-credito"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={precioCredito}
                    onChange={(e) => setPrecioCredito(e.target.value)}
                    placeholder="9800"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label htmlFor="inv-costo" className="block text-xs font-bold mb-1">
                    Costo Unitario (MXN)
                  </label>
                  <input
                    id="inv-costo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    placeholder="5200"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inv-stock" className="block text-xs font-bold mb-1">
                    Stock inicial en tu tienda *
                  </label>
                  <input
                    id="inv-stock"
                    type="number"
                    min="0"
                    required
                    value={stockDisponible}
                    onChange={(e) => setStockDisponible(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="inv-min" className="block text-xs font-bold mb-1">
                    Stock mínimo (alerta)
                  </label>
                  <input
                    id="inv-min"
                    type="number"
                    min="0"
                    required
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingProd}
                  className="alquia-gold-btn px-5 py-2.5 rounded-xl text-xs font-extrabold"
                >
                  {submittingProd ? 'Guardando...' : 'Guardar en inventario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTE MANUAL DE STOCK EN SU TIENDA */}
      {adjustEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ajustar existencias"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
              <div>
                <h3 className="text-base font-display font-bold">Ajuste de inventario</h3>
                <p className="text-xs text-zinc-300">
                  {adjustEntry.producto.nombre} · {currentSucursal?.nombre} (Actual:{' '}
                  {adjustEntry.avail.ownStockDisponible})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustProdId(null)}
                aria-label="Cerrar ajuste"
                className="p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">
                  Variación de cantidad (+ entrada / - salida)
                </label>
                <input
                  type="number"
                  required
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm font-mono-num font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Motivo del ajuste</label>
                <input
                  type="text"
                  required
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustProdId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="alquia-gold-btn px-5 py-2 rounded-xl text-xs font-extrabold"
                >
                  {submittingAdjust ? 'Aplicando...' : 'Aplicar ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ELIMINACIÓN DE PRODUCTO (SOLO ADMIN) */}
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
                Eliminar producto del catálogo
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                ¿Seguro que deseas eliminar permanentemente{' '}
                <strong>
                  {deleteTarget.nombre} ({deleteTarget.sku})
                </strong>{' '}
                y su inventario registrado en todas las tiendas? Esta acción es exclusiva del Administrador y no se puede deshacer.
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
                  disabled={deletingProd}
                  onClick={() => void handleDeleteProduct()}
                  className="alquia-red-btn px-5 py-2 rounded-xl text-xs font-extrabold disabled:opacity-60"
                >
                  {deletingProd ? 'Eliminando...' : 'Sí, eliminar producto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
