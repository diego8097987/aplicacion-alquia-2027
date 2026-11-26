import React, { useMemo, useState } from 'react';
import { Edit3, Mail, MapPin, PackagePlus, Phone, Plus, Trash2, Truck, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { CompraProveedorItem, Proveedor } from '../types/pos';
import { formatFriendlyErrorMessage } from '../utils/errorHandler';
import { formatMXN, formatShortDate, roundMXN } from '../utils/finance';

export function ProveedoresView() {
  const { user, proveedores, productos, compras, saveProveedor, registrarCompraProveedor } = useStore();
  const isAdmin = user?.rol === 'admin';

  const [subTab, setSubTab] = useState<'directorio' | 'compras'>('directorio');

  // Modal Proveedor
  const [provModal, setProvModal] = useState(false);
  const [editingProv, setEditingProv] = useState<Proveedor | null>(null);
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [categorias, setCategorias] = useState('');
  const [notas, setNotas] = useState('');
  const [provError, setProvError] = useState<string | null>(null);
  const [savingProv, setSavingProv] = useState(false);

  // Modal Compra / Surtido
  const [compraModal, setCompraModal] = useState(false);
  const [compraProvId, setCompraProvId] = useState(proveedores[0]?.id || '');
  const [compraProdId, setCompraProdId] = useState(productos[0]?.id || '');
  const [compraCant, setCompraCant] = useState('2');
  const [compraCosto, setCompraCosto] = useState(String(productos[0]?.costoUnitario || 1000));
  const [compraItems, setCompraItems] = useState<CompraProveedorItem[]>([]);
  const [compraNotas, setCompraNotas] = useState('');
  const [compraError, setCompraError] = useState<string | null>(null);
  const [savingCompra, setSavingCompra] = useState(false);

  const openNewProv = () => {
    setEditingProv(null);
    setNombre('');
    setContacto('');
    setTelefono('');
    setCorreo('');
    setCiudad('');
    setCategorias('');
    setNotas('');
    setProvError(null);
    setProvModal(true);
  };

  const openEditProv = (p: Proveedor) => {
    setEditingProv(p);
    setNombre(p.nombre);
    setContacto(p.contacto);
    setTelefono(p.telefono);
    setCorreo(p.correo);
    setCiudad(p.ciudad);
    setCategorias(p.categorias);
    setNotas(p.notas);
    setProvError(null);
    setProvModal(true);
  };

  const handleSaveProv = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvError(null);
    if (nombre.trim().length < 2 || telefono.trim().length < 7) {
      setProvError('Ingresa razón social y teléfono del proveedor.');
      return;
    }
    setSavingProv(true);
    try {
      await saveProveedor(
        {
          nombre,
          contacto,
          telefono,
          correo,
          ciudad,
          categorias,
          notas,
          activo: editingProv ? editingProv.activo : true,
        },
        editingProv?.id
      );
      setProvModal(false);
    } catch (err) {
      setProvError(formatFriendlyErrorMessage(err));
    } finally {
      setSavingProv(false);
    }
  };

  const openCompraModal = (defaultProvId?: string) => {
    setCompraProvId(defaultProvId || proveedores[0]?.id || '');
    const firstProd = productos[0];
    setCompraProdId(firstProd?.id || '');
    setCompraCosto(String(firstProd?.costoUnitario || 0));
    setCompraCant('2');
    setCompraItems([]);
    setCompraNotas('');
    setCompraError(null);
    setCompraModal(true);
  };

  const addLineCompra = () => {
    setCompraError(null);
    const prod = productos.find((p) => p.id === compraProdId);
    const qty = Math.floor(Number(compraCant) || 0);
    const cost = roundMXN(Number(compraCosto) || 0);
    if (!prod || qty <= 0 || cost < 0) {
      setCompraError('Selecciona un producto con cantidad y costo válidos.');
      return;
    }
    setCompraItems((prev) => {
      const existing = prev.find((i) => i.productoId === prod.id);
      if (existing) {
        const nextCant = existing.cantidad + qty;
        return prev.map((i) =>
          i.productoId === prod.id
            ? { ...i, cantidad: nextCant, costoUnitario: cost, subtotal: roundMXN(nextCant * cost) }
            : i
        );
      }
      return [
        ...prev,
        {
          productoId: prod.id,
          sku: prod.sku,
          nombre: prod.nombre,
          cantidad: qty,
          costoUnitario: cost,
          subtotal: roundMXN(qty * cost),
        },
      ];
    });
  };

  const totalCompra = useMemo(
    () => roundMXN(compraItems.reduce((acc, i) => acc + i.subtotal, 0)),
    [compraItems]
  );

  const handleConfirmCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompraError(null);
    if (!compraProvId) {
      setCompraError('Selecciona un proveedor.');
      return;
    }
    if (compraItems.length === 0) {
      setCompraError('Agrega al menos un artículo a la entrada de compra.');
      return;
    }
    setSavingCompra(true);
    try {
      await registrarCompraProveedor({
        proveedorId: compraProvId,
        items: compraItems,
        notas: compraNotas,
      });
      setCompraModal(false);
    } catch (err) {
      setCompraError(formatFriendlyErrorMessage(err));
    } finally {
      setSavingCompra(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-[#111114] dark:text-white">
            Proveedores y Surtido
          </h1>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
            Directorio de fabricantes, productos suministrados y entradas de compra vinculadas al inventario
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setSubTab('directorio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                subTab === 'directorio'
                  ? 'bg-[#C81E1E] text-white'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Directorio ({proveedores.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('compras')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                subTab === 'compras'
                  ? 'bg-[#C81E1E] text-white'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Historial compras ({compras.length})
            </button>
          </div>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => openCompraModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl alquia-gold-outline-btn text-xs font-bold whitespace-nowrap"
              >
                <PackagePlus className="w-4 h-4" />
                Registrar compra
              </button>
              <button
                type="button"
                onClick={openNewProv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl alquia-gold-btn text-xs font-bold whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Nuevo proveedor
              </button>
            </>
          )}
        </div>
      </div>

      {subTab === 'directorio' ? (
        proveedores.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-10 text-center alquia-card">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/50 text-[#C81E1E] dark:text-red-400 flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <h2 className="mt-3 font-display font-bold text-base text-[#111114] dark:text-white">
              Sin proveedores registrados
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Agrega tus fabricantes y distribuidores para registrar entradas de mercancía al inventario.
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={openNewProv}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl alquia-gold-btn text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Agregar primer proveedor
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {proveedores.map((prov) => {
              const linkedProducts = productos.filter((p) => p.proveedorId === prov.id);
              const comprasCount = compras.filter((c) => c.proveedorId === prov.id).length;
              return (
                <article
                  key={prov.id}
                  className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-5 alquia-card flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/50 text-[#C81E1E] dark:text-red-400 flex items-center justify-center shrink-0">
                          <Truck className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="font-display font-bold text-sm text-[#111114] dark:text-white truncate">
                            {prov.nombre}
                          </h2>
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                            {prov.contacto || 'Sin contacto asignado'}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openEditProv(prov)}
                          aria-label={`Editar proveedor ${prov.nombre}`}
                          className="p-1.5 rounded-lg alquia-gold-outline-btn"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="mt-4 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                      <p className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#C81E1E]" />
                        {prov.telefono}
                      </p>
                      {prov.correo && (
                        <p className="flex items-center gap-2 truncate">
                          <Mail className="w-3.5 h-3.5 text-[#C81E1E]" />
                          {prov.correo}
                        </p>
                      )}
                      {prov.ciudad && (
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[#C81E1E]" />
                          {prov.ciudad}
                        </p>
                      )}
                    </div>

                    {prov.categorias && (
                      <p className="mt-3 text-xs text-neutral-700 dark:text-neutral-300">
                        <span className="font-semibold">Suministra:</span> {prov.categorias}
                      </p>
                    )}
                    {prov.notas && (
                      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{prov.notas}</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400 tabular-nums">
                      {linkedProducts.length} productos · {comprasCount} compras
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openCompraModal(prov.id)}
                        className="px-3 py-1.5 rounded-lg alquia-gold-btn text-xs font-bold"
                      >
                        Surtir stock
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        <section className="rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 overflow-hidden alquia-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-[#0B0B0D]">
                  <th className="py-3 px-4">Folio</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Proveedor</th>
                  <th className="py-3 px-4">Artículos recibidos</th>
                  <th className="py-3 px-4 text-right">Costo total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
                {compras.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-xs text-neutral-600 dark:text-neutral-400">
                      Aún no hay entradas de compra registradas.
                    </td>
                  </tr>
                ) : (
                  compras.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-bold text-[#C81E1E] dark:text-red-400">
                        {c.folio}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
                        {formatShortDate(c.creadoEn)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#111114] dark:text-white">
                        {c.proveedorNombre}
                      </td>
                      <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400">
                        {c.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(' · ')}
                        {c.notas ? ` — ${c.notas}` : ''}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#111114] dark:text-white tabular-nums">
                        {formatMXN(c.totalCosto)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal Crear/Editar Proveedor */}
      {provModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prov-modal-title"
        >
          <form
            onSubmit={handleSaveProv}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-6 alquia-card space-y-3.5 my-auto"
          >
            <div className="flex items-center justify-between">
              <h2 id="prov-modal-title" className="font-display font-bold text-lg text-[#111114] dark:text-white">
                {editingProv ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
              <button type="button" onClick={() => setProvModal(false)} aria-label="Cerrar modal" className="p-1 text-neutral-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pv-nombre" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Razón social / Nombre *
                </label>
                <input
                  id="pv-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="pv-contacto" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Contacto
                </label>
                <input
                  id="pv-contacto"
                  type="text"
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pv-tel" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Teléfono *
                </label>
                <input
                  id="pv-tel"
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="pv-correo" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Correo
                </label>
                <input
                  id="pv-correo"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pv-ciudad" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Ciudad
                </label>
                <input
                  id="pv-ciudad"
                  type="text"
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                  placeholder="Ej. Celaya, Gto."
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="pv-cat" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Líneas / Categorías
                </label>
                <input
                  id="pv-cat"
                  type="text"
                  value={categorias}
                  onChange={(e) => setCategorias(e.target.value)}
                  placeholder="Salas, Comedores..."
                  className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pv-notas" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                Condiciones / Notas
              </label>
              <input
                id="pv-notas"
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
              />
            </div>

            {provError && <p className="text-xs text-[#C81E1E] font-medium">{provError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProvModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingProv}
                className="px-5 py-2 rounded-xl alquia-gold-btn text-xs font-bold disabled:opacity-50"
              >
                {savingProv ? 'Guardando...' : 'Guardar proveedor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Entrada de Compra a Proveedor */}
      {compraModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compra-modal-title"
        >
          <form
            onSubmit={handleConfirmCompra}
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-800 p-6 alquia-card space-y-4 my-auto"
          >
            <div className="flex items-center justify-between">
              <h2 id="compra-modal-title" className="font-display font-bold text-lg text-[#111114] dark:text-white">
                Registrar entrada por compra a proveedor
              </h2>
              <button type="button" onClick={() => setCompraModal(false)} aria-label="Cerrar compra" className="p-1 text-neutral-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label htmlFor="oc-prov" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                Proveedor *
              </label>
              <select
                id="oc-prov"
                value={compraProvId}
                onChange={(e) => setCompraProvId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
              >
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 space-y-2.5">
              <p className="text-xs font-bold text-[#C81E1E] dark:text-red-400">Agregar artículos recibidos</p>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  aria-label="Seleccionar producto para compra"
                  value={compraProdId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCompraProdId(id);
                    const found = productos.find((p) => p.id === id);
                    if (found) setCompraCosto(String(found.costoUnitario));
                  }}
                  className="sm:col-span-6 px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs text-[#111114] dark:text-white"
                >
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  aria-label="Cantidad comprada"
                  value={compraCant}
                  onChange={(e) => setCompraCant(e.target.value)}
                  placeholder="Cant."
                  className="sm:col-span-2 px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs font-mono text-[#111114] dark:text-white"
                />
                <input
                  type="number"
                  min="0"
                  aria-label="Costo unitario de compra"
                  value={compraCosto}
                  onChange={(e) => setCompraCosto(e.target.value)}
                  placeholder="Costo"
                  className="sm:col-span-2 px-2.5 py-2 rounded-lg bg-white dark:bg-[#141418] border border-neutral-200 dark:border-neutral-700 text-xs font-mono text-[#111114] dark:text-white"
                />
                <button
                  type="button"
                  onClick={addLineCompra}
                  className="sm:col-span-2 py-2 rounded-lg alquia-gold-btn text-xs font-bold"
                >
                  + Añadir
                </button>
              </div>
            </div>

            {compraItems.length > 0 && (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border-y border-neutral-200 dark:border-neutral-800 max-h-44 overflow-y-auto">
                {compraItems.map((line) => (
                  <div key={line.productoId} className="py-2 flex items-center justify-between text-xs">
                    <span>
                      <strong>{line.cantidad}x</strong> {line.nombre}{' '}
                      <span className="font-mono text-neutral-500">({formatMXN(line.costoUnitario)} c/u)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold tabular-nums">{formatMXN(line.subtotal)}</span>
                      <button
                        type="button"
                        onClick={() => setCompraItems((prev) => prev.filter((i) => i.productoId !== line.productoId))}
                        aria-label={`Quitar ${line.nombre}`}
                        className="text-[#C81E1E]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label htmlFor="oc-notas" className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                Número de factura / Notas
              </label>
              <input
                id="oc-notas"
                type="text"
                value={compraNotas}
                onChange={(e) => setCompraNotas(e.target.value)}
                placeholder="Ej. Factura F-9821 liquidada"
                className="w-full px-3 py-2 rounded-xl bg-neutral-100 dark:bg-[#0B0B0D] border border-neutral-200 dark:border-neutral-800 text-sm text-[#111114] dark:text-white"
              />
            </div>

            <div className="flex items-center justify-between text-sm font-bold pt-1">
              <span>Total inversión compra</span>
              <span className="font-mono text-lg text-[#C81E1E] dark:text-red-400 tabular-nums">
                {formatMXN(totalCompra)}
              </span>
            </div>

            {compraError && <p className="text-xs text-[#C81E1E] font-medium">{compraError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompraModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingCompra}
                className="px-5 py-2 rounded-xl alquia-gold-btn text-xs font-bold disabled:opacity-50"
              >
                {savingCompra ? 'Registrando...' : 'Confirmar entrada al inventario'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
