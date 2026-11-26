import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Minus,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { FrecuenciaPago, MetodoPago, NavTab, Producto, TipoVenta } from '../types/pos';
import { formatFriendlyErrorMessage } from '../utils/errorHandler';
import {
  addDaysToISODate,
  calculateCartTotals,
  calculateCreditPlan,
  formatMXN,
  formatShortDate,
  getProductStoreAvailability,
  roundMXN,
  todayISODate,
} from '../utils/finance';

interface PosViewProps {
  onNavigate?: (tab: NavTab) => void;
}

export function PosView({ onNavigate }: PosViewProps) {
  const {
    productos,
    sucursales,
    inventarioSucursales,
    activeSucursalId,
    currentSucursal,
    activeCajaTurno,
    clientes,
    ventas,
    addCliente,
    procesarVentaPOS,
    setActiveTicket,
    notify,
  } = useStore();

  const [subTab, setSubTab] = useState<'caja' | 'historial'>('caja');
  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('Todas');
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>('contado');
  const [cart, setCart] = useState<Array<{ producto: Producto; cantidad: number }>>([]);
  const [clienteId, setClienteId] = useState<string>(clientes[0]?.id || '');
  const [descuento, setDescuento] = useState('0');
  const [aplicarSaldoAFavor, setAplicarSaldoAFavor] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [pagoInicial, setPagoInicial] = useState('1500');
  const [frecuencia, setFrecuencia] = useState<FrecuenciaPago>('semanal');
  const [numPagos, setNumPagos] = useState('12');
  const [fechaLimite, setFechaLimite] = useState(() => addDaysToISODate(todayISODate(), 30));
  const [condiciones, setCondiciones] = useState('Plazo 30 días. Mercancía reservada hasta liquidación.');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick add client inline panel
  const [showNewClient, setShowNewClient] = useState(false);
  const [newCliNombre, setNewCliNombre] = useState('');
  const [newCliTel, setNewCliTel] = useState('');
  const [newCliDir, setNewCliDir] = useState('');
  const [newCliRef, setNewCliRef] = useState('');

  useEffect(() => {
    setCart([]);
    setErrorMsg(null);
  }, [activeSucursalId]);

  const categorias = useMemo(() => {
    const set = new Set<string>(['Todas']);
    productos.forEach((p) => {
      if (p.activo) set.add(p.categoria);
    });
    return Array.from(set);
  }, [productos]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productos.filter((p) => {
      if (!p.activo) return false;
      if (categoriaFilter !== 'Todas' && p.categoria !== categoriaFilter) return false;
      if (!term) return true;
      return (
        p.nombre.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.marca.toLowerCase().includes(term)
      );
    });
  }, [productos, search, categoriaFilter]);

  const selectedCliente = useMemo(
    () => clientes.find((c) => c.id === clienteId) || clientes[0] || null,
    [clientes, clienteId]
  );

  const descuentoNum = Math.max(0, Number(descuento) || 0);
  const saldoAFavorDisp = aplicarSaldoAFavor && selectedCliente ? selectedCliente.saldoAFavor : 0;
  const totals = useMemo(
    () => calculateCartTotals(cart, tipoVenta, descuentoNum, saldoAFavorDisp),
    [cart, tipoVenta, descuentoNum, saldoAFavorDisp]
  );

  const pagoInicialNum = Math.max(0, Number(pagoInicial) || 0);
  const numPagosInt = Math.max(1, Math.min(120, Math.floor(Number(numPagos) || 1)));

  const creditPreview = useMemo(() => {
    if (tipoVenta !== 'credito' || totals.total <= 0) return null;
    if (pagoInicialNum >= totals.total) return null;
    try {
      return calculateCreditPlan(totals.total, pagoInicialNum, frecuencia, numPagosInt, todayISODate());
    } catch {
      return null;
    }
  }, [tipoVenta, totals.total, pagoInicialNum, frecuencia, numPagosInt]);

  const getOwnStock = (producto: Producto) =>
    getProductStoreAvailability({
      producto,
      inventarioSucursales,
      sucursales,
      currentSucursalId: activeSucursalId,
    });

  const addToCart = (producto: Producto) => {
    setErrorMsg(null);
    const avail = getOwnStock(producto);
    const existing = cart.find((i) => i.producto.id === producto.id);
    if (existing) {
      if (existing.cantidad >= avail.ownStockDisponible) {
        notify(
          `Solo hay ${avail.ownStockDisponible} unidades disponibles en ${currentSucursal?.nombre || 'tu tienda'}.`,
          'error'
        );
        return;
      }
      setCart((prev) =>
        prev.map((i) =>
          i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      );
      return;
    }
    if (avail.ownStockDisponible <= 0) {
      notify(avail.statusMessage, 'error');
      return;
    }
    setCart((prev) => [...prev, { producto, cantidad: 1 }]);
  };

  const updateCartQty = (productoId: string, delta: number) => {
    const existing = cart.find((i) => i.producto.id === productoId);
    if (!existing) return;
    const avail = getOwnStock(existing.producto);
    const nextQty = existing.cantidad + delta;
    if (nextQty > avail.ownStockDisponible) {
      notify(`Stock máximo en tu tienda: ${avail.ownStockDisponible}`, 'error');
      return;
    }
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.producto.id !== productoId) return item;
          if (nextQty <= 0) return null;
          return { ...item, cantidad: nextQty };
        })
        .filter((x): x is { producto: Producto; cantidad: number } => x !== null)
    );
  };

  const handleQuickCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = newCliTel.replace(/\D/g, '');
    if (newCliNombre.trim().length < 2 || digits.length < 10) {
      setErrorMsg('Ingresa nombre completo y número de WhatsApp válido (mínimo 10 dígitos).');
      return;
    }
    try {
      const created = await addCliente({
        nombre: newCliNombre,
        telefono: newCliTel,
        direccion: newCliDir,
        referencias: newCliRef,
      });
      setClienteId(created.id);
      setNewCliNombre('');
      setNewCliTel('');
      setNewCliDir('');
      setNewCliRef('');
      setShowNewClient(false);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(formatFriendlyErrorMessage(err));
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (cart.length === 0) {
      setErrorMsg('Agrega al menos un mueble o artículo al carrito.');
      return;
    }
    if (!selectedCliente) {
      setErrorMsg('Selecciona o registra un cliente antes de confirmar.');
      return;
    }
    if (tipoVenta === 'apartado' && (pagoInicialNum <= 0 || pagoInicialNum >= totals.total)) {
      setErrorMsg('El anticipo del apartado debe ser mayor a $0 y menor al total.');
      return;
    }
    if (tipoVenta === 'credito' && pagoInicialNum >= totals.total) {
      setErrorMsg('El enganche debe ser menor al total; para pago completo usa Contado.');
      return;
    }

    setSubmitting(true);
    try {
      await procesarVentaPOS({
        tipo: tipoVenta,
        clienteId: selectedCliente.id,
        cart,
        descuento: descuentoNum,
        aplicarSaldoAFavor,
        metodoPago,
        pagoInicial: tipoVenta === 'contado' ? totals.total : pagoInicialNum,
        efectivoRecibido: Number(efectivoRecibido) || undefined,
        frecuencia,
        numPagos: numPagosInt,
        fechaLimite,
        condiciones,
      });
      setCart([]);
      setDescuento('0');
      setEfectivoRecibido('');
      setAplicarSaldoAFavor(false);
    } catch (err) {
      setErrorMsg(formatFriendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const cambioCalculado =
    tipoVenta === 'contado' && metodoPago === 'efectivo' && Number(efectivoRecibido) > totals.total
      ? roundMXN(Number(efectivoRecibido) - totals.total)
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#111114] dark:text-white">
            Punto de Venta y Comprobantes
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            Ventas de contado, crédito y apartados en{' '}
            <strong>{currentSucursal?.nombre || 'Tienda Principal'}</strong> con PDF hoja completa y WhatsApp
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 self-start">
          <button
            type="button"
            onClick={() => setSubTab('caja')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              subTab === 'caja'
                ? 'bg-[#C81E1E] text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-[#111114] dark:hover:text-white'
            }`}
          >
            Mostrador
          </button>
          <button
            type="button"
            onClick={() => setSubTab('historial')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              subTab === 'historial'
                ? 'bg-[#C81E1E] text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-[#111114] dark:hover:text-white'
            }`}
          >
            Ventas del día ({ventas.length})
          </button>
        </div>
      </div>

      {/* Estado de Caja del Día */}
      <div
        className={`rounded-2xl px-4 py-3 border flex flex-wrap items-center justify-between gap-3 text-xs ${
          activeCajaTurno
            ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          <Calculator className="w-4 h-4 shrink-0" />
          {activeCajaTurno ? (
            <span>
              Caja abierta por <strong>{activeCajaTurno.abiertaPorNombre}</strong> · Fondo inicial{' '}
              <strong className="font-mono">{formatMXN(activeCajaTurno.fondoInicial)}</strong>
            </span>
          ) : (
            <span>
              La caja del día aún está cerrada. Abre caja antes de iniciar cobros para llevar tu corte en PDF.
            </span>
          )}
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('caja')}
            className="alquia-gold-btn px-3 py-1.5 rounded-lg text-[11px] font-extrabold"
          >
            {activeCajaTurno ? 'Ver Corte / Cerrar Caja' : 'Abrir Caja'}
          </button>
        )}
      </div>

      {subTab === 'historial' ? (
        <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 overflow-hidden alquia-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-[#0B0B0D]">
                  <th className="py-3 px-4">Folio</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Modalidad</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Pago inicial</th>
                  <th className="py-3 px-4 text-right">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
                {ventas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 px-4 text-center text-xs text-neutral-600 dark:text-neutral-400">
                      Aún no hay ventas registradas. Realiza tu primera venta en la pestaña Caja / Mostrador.
                    </td>
                  </tr>
                ) : (
                  ventas.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#C81E1E] dark:text-red-400 tabular-nums">
                        {v.folio}
                      </td>
                      <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
                        {formatShortDate(v.creadoEn)}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#111114] dark:text-white">
                        {v.clienteNombre}
                      </td>
                      <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400 capitalize">
                        {v.tipo} · {v.metodoPago}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#111114] dark:text-white tabular-nums">
                        {formatMXN(v.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatMXN(v.pagoInicial)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
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
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg alquia-gold-outline-btn text-xs font-bold"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Ver / PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Izquierda: Catálogo seleccionable */}
          <div className="xl:col-span-7 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-4 alquia-card space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  aria-label="Buscar mueble por nombre o SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar mueble por nombre, SKU o marca..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 focus:border-[#C81E1E] text-sm text-[#111114] dark:text-white placeholder:text-neutral-400 outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categorias.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      categoriaFilter === cat
                        ? 'bg-[#C81E1E] text-white'
                        : 'bg-neutral-100 dark:bg-[#0B0B0D] text-neutral-600 dark:text-neutral-400 hover:text-[#111114] dark:hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-8 text-center alquia-card">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/50 text-[#C81E1E] dark:text-red-400 flex items-center justify-center">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="mt-3 font-display font-bold text-sm text-[#111114] dark:text-white">
                  {productos.length === 0
                    ? 'Aún no hay muebles en tu catálogo'
                    : 'No se encontraron productos con ese filtro'}
                </h3>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {productos.length === 0
                    ? 'Registra tus productos reales en Inventario o Productos para empezar a cobrar.'
                    : 'Prueba borrando el término de búsqueda o selecciona Todas las categorías.'}
                </p>
                {productos.length === 0 && onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('inventario')}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl alquia-gold-btn text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar en Inventario
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {filteredProducts.map((prod) => {
                  const activePrice = tipoVenta === 'contado' ? prod.precioContado : prod.precioCredito;
                  const avail = getOwnStock(prod);
                  const sinStock = avail.ownStockDisponible <= 0;
                  return (
                    <div
                      key={prod.id}
                      className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-4 alquia-card flex flex-col justify-between gap-3 hover:border-[#C81E1E] transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                          <span className="font-mono font-medium">
                            {prod.sku} · {prod.categoria}
                          </span>
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              sinStock
                                ? 'text-[#C81E1E]'
                                : avail.ownStockDisponible <= avail.ownStockMinimo
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {avail.ownStockDisponible} aquí
                          </span>
                        </div>
                        <h3 className="mt-1.5 font-display font-bold text-sm text-[#111114] dark:text-white leading-snug">
                          {prod.nombre}
                        </h3>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{prod.marca}</p>
                      </div>

                      <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                            {tipoVenta === 'contado' ? 'Precio contado' : 'Precio crédito/apartado'}
                          </p>
                          <p className="font-mono font-bold text-base text-[#C81E1E] dark:text-red-400 tabular-nums">
                            {formatMXN(activePrice)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={sinStock}
                          onClick={() => addToCart(prod)}
                          aria-label={`Agregar ${prod.nombre} al carrito`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl alquia-gold-btn text-xs font-bold disabled:opacity-45 whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {sinStock ? 'No disponible' : 'Agregar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Derecha: Carrito y Checkout */}
          <form
            onSubmit={handleCheckout}
            className="xl:col-span-5 rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card space-y-4 sticky top-20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#C81E1E]" />
                <h2 className="font-display font-bold text-base text-[#111114] dark:text-white">
                  Orden actual ({cart.reduce((a, b) => a + b.cantidad, 0)})
                </h2>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-semibold text-[#C81E1E] hover:underline"
                >
                  Vaciar
                </button>
              )}
            </div>

            {/* Selector modalidad Contado / Crédito / Apartado */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800">
              {(['contado', 'credito', 'apartado'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoVenta(t)}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    tipoVenta === t
                      ? 'bg-[#C81E1E] text-white shadow-xs'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-[#111114] dark:hover:text-white'
                  }`}
                >
                  {t === 'contado' ? 'Contado' : t === 'credito' ? 'Crédito' : 'Apartado'}
                </button>
              ))}
            </div>

            {/* Cliente + Alta rápida */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="pos-cliente"
                  className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Cliente (WhatsApp para envío de ticket)
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewClient((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg alquia-gold-outline-btn text-xs font-bold"
                >
                  {showNewClient ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {showNewClient ? 'Cancelar' : 'Nuevo cliente'}
                </button>
              </div>

              {showNewClient ? (
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 space-y-2">
                  <input
                    type="text"
                    placeholder="Nombre completo *"
                    value={newCliNombre}
                    onChange={(e) => setNewCliNombre(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs text-[#111114] dark:text-white"
                  />
                  <input
                    type="tel"
                    placeholder="WhatsApp del cliente (10 dígitos) *"
                    value={newCliTel}
                    onChange={(e) => setNewCliTel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs font-mono text-[#111114] dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Dirección"
                    value={newCliDir}
                    onChange={(e) => setNewCliDir(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs text-[#111114] dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Referencias de entrega"
                    value={newCliRef}
                    onChange={(e) => setNewCliRef(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs text-[#111114] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleQuickCreateClient}
                    className="w-full py-2 rounded-lg alquia-gold-btn text-xs font-bold"
                  >
                    Guardar cliente
                  </button>
                </div>
              ) : clientes.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowNewClient(true)}
                  className="w-full py-2.5 px-3.5 rounded-xl alquia-gold-outline-btn border-dashed text-xs font-bold flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Sin clientes registrados · Agregar primer cliente
                </button>
              ) : (
                <select
                  id="pos-cliente"
                  value={selectedCliente?.id || ''}
                  onChange={(e) => {
                    setClienteId(e.target.value);
                    setAplicarSaldoAFavor(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 focus:border-[#C81E1E] text-sm text-[#111114] dark:text-white outline-none"
                >
                  {clientes.map((cli) => (
                    <option key={cli.id} value={cli.id}>
                      {cli.nombre} — WA: {cli.telefono}
                      {cli.saldoAFavor > 0 ? ` (Saldo a favor ${formatMXN(cli.saldoAFavor)})` : ''}
                    </option>
                  ))}
                </select>
              )}

              {selectedCliente && selectedCliente.saldoAFavor > 0 && (
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300 cursor-pointer">
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={aplicarSaldoAFavor}
                      onChange={(e) => setAplicarSaldoAFavor(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    Aplicar saldo a favor disponible
                  </span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatMXN(selectedCliente.saldoAFavor)}
                  </span>
                </label>
              )}
            </div>

            {/* Líneas del carrito */}
            <div className="max-h-48 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 border-y border-neutral-200 dark:border-neutral-800 py-1">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  Selecciona muebles del catálogo para armar el ticket.
                </p>
              ) : (
                cart.map(({ producto, cantidad }) => {
                  const precio = tipoVenta === 'contado' ? producto.precioContado : producto.precioCredito;
                  return (
                    <div key={producto.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#111114] dark:text-white truncate">
                          {producto.nombre}
                        </p>
                        <p className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 tabular-nums">
                          {formatMXN(precio)} c/u
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateCartQty(producto.id, -1)}
                          aria-label={`Restar cantidad de ${producto.nombre}`}
                          className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[#111114] dark:text-white"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-mono text-xs font-bold tabular-nums">
                          {cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(producto.id, 1)}
                          aria-label={`Sumar cantidad de ${producto.nombre}`}
                          className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[#111114] dark:text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCartQty(producto.id, -cantidad)}
                          aria-label={`Quitar ${producto.nombre}`}
                          className="p-1.5 text-neutral-400 hover:text-[#C81E1E]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Descuento y Método de pago */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pos-desc" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Descuento (MXN)
                </label>
                <input
                  id="pos-desc"
                  type="number"
                  min="0"
                  step="10"
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white outline-none"
                />
              </div>
              <div>
                <label htmlFor="pos-metodo" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Método de pago
                </label>
                <select
                  id="pos-metodo"
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white outline-none"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia SPEI</option>
                </select>
              </div>
            </div>

            {/* Parámetros específicos según modalidad */}
            {tipoVenta === 'contado' && metodoPago === 'efectivo' && (
              <div>
                <label htmlFor="pos-recibido" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Efectivo recibido (opcional para calcular cambio)
                </label>
                <input
                  id="pos-recibido"
                  type="number"
                  min="0"
                  step="10"
                  placeholder={totals.total.toFixed(2)}
                  value={efectivoRecibido}
                  onChange={(e) => setEfectivoRecibido(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm font-mono tabular-nums text-[#111114] dark:text-white outline-none"
                />
              </div>
            )}

            {tipoVenta === 'credito' && (
              <div className="p-3.5 rounded-xl bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 space-y-3">
                <p className="text-xs font-bold text-[#C81E1E] dark:text-red-400">
                  Plan de crédito (precio fijo)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="cr-enganche" className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
                      Enganche
                    </label>
                    <input
                      id="cr-enganche"
                      type="number"
                      min="0"
                      value={pagoInicial}
                      onChange={(e) => setPagoInicial(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] text-xs font-mono tabular-nums text-[#111114] dark:text-white border border-neutral-200 dark:border-neutral-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="cr-frec" className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
                      Frecuencia
                    </label>
                    <select
                      id="cr-frec"
                      value={frecuencia}
                      onChange={(e) => setFrecuencia(e.target.value as FrecuenciaPago)}
                      className="w-full px-2 py-2 rounded-lg bg-white dark:bg-[#141418] text-xs text-[#111114] dark:text-white border border-neutral-200 dark:border-neutral-700"
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quincenal">Quincenal</option>
                      <option value="mensual">Mensual</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cr-pagos" className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
                      # Pagos
                    </label>
                    <input
                      id="cr-pagos"
                      type="number"
                      min="1"
                      max="120"
                      value={numPagos}
                      onChange={(e) => setNumPagos(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] text-xs font-mono tabular-nums text-[#111114] dark:text-white border border-neutral-200 dark:border-neutral-700"
                    />
                  </div>
                </div>
                {creditPreview && (
                  <div className="text-xs text-[#111114] dark:text-neutral-200 flex items-center justify-between pt-1 border-t border-red-200 dark:border-red-900/50">
                    <span>
                      {numPagosInt} pagos de <strong className="font-mono">{formatMXN(creditPreview.montoPago)}</strong>
                    </span>
                    <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      1er pago: {formatShortDate(creditPreview.proximaFechaPago)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {tipoVenta === 'apartado' && (
              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60 space-y-2.5">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Condiciones de apartado (reserva de stock)
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="ap-anticipo" className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
                      Anticipo inicial *
                    </label>
                    <input
                      id="ap-anticipo"
                      type="number"
                      min="1"
                      value={pagoInicial}
                      onChange={(e) => setPagoInicial(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] text-xs font-mono tabular-nums text-[#111114] dark:text-white border border-amber-200 dark:border-amber-800"
                    />
                  </div>
                  <div>
                    <label htmlFor="ap-limite" className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
                      Fecha límite
                    </label>
                    <input
                      id="ap-limite"
                      type="date"
                      value={fechaLimite}
                      onChange={(e) => setFechaLimite(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] text-xs font-mono text-[#111114] dark:text-white border border-amber-200 dark:border-amber-800"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  aria-label="Condiciones del apartado"
                  value={condiciones}
                  onChange={(e) => setCondiciones(e.target.value)}
                  placeholder="Condiciones del apartado"
                  className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] text-xs text-[#111114] dark:text-white border border-amber-200 dark:border-amber-800"
                />
              </div>
            )}

            {/* Totales */}
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5 text-sm">
              <div className="flex justify-between text-xs text-neutral-600 dark:text-neutral-400">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{formatMXN(totals.subtotal)}</span>
              </div>
              {totals.descuentoAplicado > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                  <span>Descuento</span>
                  <span className="font-mono tabular-nums">-{formatMXN(totals.descuentoAplicado)}</span>
                </div>
              )}
              {totals.saldoAFavorUsado > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400">
                  <span>Saldo a favor aplicado</span>
                  <span className="font-mono tabular-nums">-{formatMXN(totals.saldoAFavorUsado)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1">
                <span className="font-display font-bold text-[#111114] dark:text-white">Total</span>
                <span className="font-mono font-extrabold text-xl text-[#C81E1E] dark:text-red-400 tabular-nums">
                  {formatMXN(totals.total)}
                </span>
              </div>
              {cambioCalculado > 0 && (
                <div className="flex justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <span>Cambio a devolver</span>
                  <span className="font-mono tabular-nums">{formatMXN(cambioCalculado)}</span>
                </div>
              )}
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3.5 py-2.5 text-xs text-[#C81E1E] dark:text-red-200"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full py-3 rounded-xl alquia-gold-btn font-display font-bold text-sm disabled:opacity-50"
            >
              {submitting ? 'Registrando operación...' : 'Confirmar y emitir ticket / PDF'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
