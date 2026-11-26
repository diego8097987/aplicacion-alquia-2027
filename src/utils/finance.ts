import type {
  Abono,
  Apartado,
  CajaTurno,
  Credito,
  EstadoPuntualidad,
  FrecuenciaPago,
  InventarioSucursal,
  Producto,
  ResolucionCancelacion,
  Sucursal,
  TicketData,
  TipoVenta,
  Venta,
  VentaItem,
} from '../types/pos';

export function roundMXN(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMXN(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMXN(value));
}

export function formatShortDate(isoDateOrTimestamp: string): string {
  if (!isoDateOrTimestamp) return '—';
  const clean = isoDateOrTimestamp.length === 10 ? `${isoDateOrTimestamp}T12:00:00` : isoDateOrTimestamp;
  const d = new Date(clean);
  if (Number.isNaN(d.getTime())) return isoDateOrTimestamp;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeMX(isoTimestamp: string): string {
  if (!isoTimestamp) return '—';
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return isoTimestamp;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function todayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToISODate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function addFrequencyToDate(isoDate: string, frecuencia: FrecuenciaPago): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (frecuencia === 'semanal') {
    dt.setUTCDate(dt.getUTCDate() + 7);
  } else if (frecuencia === 'quincenal') {
    dt.setUTCDate(dt.getUTCDate() + 15);
  } else {
    dt.setUTCMonth(dt.getUTCMonth() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

export function diffDaysISO(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toISO.slice(0, 10).split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

export function normalizeWhatsAppDigits(rawPhone?: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

export function buildWhatsAppLink(rawPhone: string | undefined, message: string): string {
  const fullPhone = normalizeWhatsAppDigits(rawPhone);
  return fullPhone
    ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Evalúa si un pago se realizó al día o atrasado comparando la fecha programada vs fecha real.
 */
export function evaluatePaymentPunctuality(
  scheduledDateISO: string,
  paymentDateISO: string = todayISODate()
): { estadoPuntualidad: EstadoPuntualidad; diasAtraso: number } {
  if (!scheduledDateISO || scheduledDateISO.length < 10) {
    return { estadoPuntualidad: 'al_dia', diasAtraso: 0 };
  }
  const diff = diffDaysISO(scheduledDateISO.slice(0, 10), paymentDateISO.slice(0, 10));
  if (diff > 0) {
    return { estadoPuntualidad: 'atrasado', diasAtraso: diff };
  }
  return { estadoPuntualidad: 'al_dia', diasAtraso: 0 };
}

export interface CreditScheduleItem {
  numero: number;
  fecha: string;
  monto: number;
}

export interface CreditPlanResult {
  montoFinanciado: number;
  montoPago: number;
  proximaFechaPago: string;
  schedule: CreditScheduleItem[];
}

export function calculateCreditPlan(
  montoTotal: number,
  enganche: number,
  frecuencia: FrecuenciaPago,
  numPagos: number,
  startDateISO: string,
  customFirstDueDate?: string
): CreditPlanResult {
  if (montoTotal <= 0) {
    throw new Error('El monto total del crédito debe ser mayor a $0.');
  }
  if (enganche < 0 || enganche >= montoTotal) {
    throw new Error('El enganche debe ser mayor o igual a $0 y menor al total.');
  }
  if (!Number.isInteger(numPagos) || numPagos < 1 || numPagos > 120) {
    throw new Error('El número de pagos debe estar entre 1 y 120.');
  }

  const montoFinanciado = roundMXN(montoTotal - enganche);
  const basePago = roundMXN(montoFinanciado / numPagos);
  const schedule: CreditScheduleItem[] = [];
  let currentDate = startDateISO.slice(0, 10);
  let acumulado = 0;

  for (let i = 1; i <= numPagos; i++) {
    if (i === 1 && customFirstDueDate && customFirstDueDate.length >= 10) {
      currentDate = customFirstDueDate.slice(0, 10);
    } else {
      currentDate = addFrequencyToDate(currentDate, frecuencia);
    }
    const isLast = i === numPagos;
    const monto = isLast ? roundMXN(montoFinanciado - acumulado) : basePago;
    acumulado = roundMXN(acumulado + monto);
    schedule.push({ numero: i, fecha: currentDate, monto });
  }

  return {
    montoFinanciado,
    montoPago: basePago,
    proximaFechaPago: schedule[0].fecha,
    schedule,
  };
}

export type CreditHealth = 'liquidado' | 'cancelado' | 'vencido' | 'por_vencer' | 'al_corriente';

export function getCreditHealth(
  credito: Pick<Credito, 'estado' | 'saldoPendiente' | 'proximaFechaPago'>,
  todayISO: string = todayISODate()
): { health: CreditHealth; daysDiff: number } {
  if (credito.estado === 'cancelado') return { health: 'cancelado', daysDiff: 0 };
  if (credito.estado === 'liquidado' || credito.saldoPendiente <= 0) {
    return { health: 'liquidado', daysDiff: 0 };
  }
  const daysDiff = diffDaysISO(todayISO, credito.proximaFechaPago);
  if (daysDiff < 0) return { health: 'vencido', daysDiff };
  if (daysDiff <= 7) return { health: 'por_vencer', daysDiff };
  return { health: 'al_corriente', daysDiff };
}

export type LayawayHealth = 'liquidado' | 'cancelado' | 'vencido' | 'por_vencer' | 'vigente';

export function getLayawayHealth(
  apartado: Pick<Apartado, 'estado' | 'saldoPendiente' | 'fechaLimite' | 'proximoPagoFecha'>,
  todayISO: string = todayISODate()
): { health: LayawayHealth; daysLeft: number } {
  if (apartado.estado === 'cancelado') return { health: 'cancelado', daysLeft: 0 };
  if (apartado.estado === 'liquidado' || apartado.saldoPendiente <= 0) {
    return { health: 'liquidado', daysLeft: 0 };
  }
  const targetDate =
    apartado.proximoPagoFecha && apartado.proximoPagoFecha < apartado.fechaLimite
      ? apartado.proximoPagoFecha
      : apartado.fechaLimite;
  const daysLeft = diffDaysISO(todayISO, targetDate);
  if (daysLeft < 0) return { health: 'vencido', daysLeft };
  if (daysLeft <= 7) return { health: 'por_vencer', daysLeft };
  return { health: 'vigente', daysLeft };
}

export function applyPaymentToCredit(
  credito: Credito,
  montoAbono: number,
  todayISO: string = todayISODate(),
  customNextDueDate?: string
): {
  totalAbonado: number;
  saldoPendiente: number;
  pagosRealizados: number;
  proximaFechaPago: string;
  estado: 'activo' | 'liquidado';
  estadoPuntualidad: EstadoPuntualidad;
  diasAtraso: number;
} {
  if (credito.estado !== 'activo') {
    throw new Error('Solo se pueden registrar abonos a créditos activos.');
  }
  const monto = roundMXN(montoAbono);
  if (monto <= 0) {
    throw new Error('El monto del abono debe ser mayor a $0.');
  }
  if (monto > roundMXN(credito.saldoPendiente) + 0.01) {
    throw new Error('El abono no puede superar el saldo pendiente.');
  }

  const punctuality = evaluatePaymentPunctuality(credito.proximaFechaPago, todayISO);
  const saldoNuevo = Math.max(0, roundMXN(credito.saldoPendiente - monto));
  const totalAbonado = roundMXN(credito.totalAbonado + monto);
  const liquidado = saldoNuevo <= 0.009;
  const pagosRealizados = liquidado ? credito.numPagos : credito.pagosRealizados + 1;
  const baseFecha = credito.proximaFechaPago < todayISO ? todayISO : credito.proximaFechaPago;
  const autoNext = addFrequencyToDate(baseFecha, credito.frecuencia);
  const proximaFechaPago = liquidado
    ? credito.proximaFechaPago
    : customNextDueDate && customNextDueDate.length >= 10
      ? customNextDueDate.slice(0, 10)
      : autoNext;

  return {
    totalAbonado,
    saldoPendiente: liquidado ? 0 : saldoNuevo,
    pagosRealizados,
    proximaFechaPago,
    estado: liquidado ? 'liquidado' : 'activo',
    estadoPuntualidad: punctuality.estadoPuntualidad,
    diasAtraso: punctuality.diasAtraso,
  };
}

export function applyPaymentToLayaway(
  apartado: Apartado,
  montoAbono: number,
  todayISO: string = todayISODate()
): {
  totalAbonado: number;
  saldoPendiente: number;
  estado: 'vigente' | 'liquidado';
  estadoPuntualidad: EstadoPuntualidad;
  diasAtraso: number;
} {
  if (apartado.estado !== 'vigente') {
    throw new Error('Solo se pueden registrar abonos a apartados vigentes.');
  }
  const monto = roundMXN(montoAbono);
  if (monto <= 0) {
    throw new Error('El monto del abono debe ser mayor a $0.');
  }
  if (monto > roundMXN(apartado.saldoPendiente) + 0.01) {
    throw new Error('El abono no puede superar el saldo pendiente del apartado.');
  }

  const refDate = apartado.proximoPagoFecha || apartado.fechaLimite;
  const punctuality = evaluatePaymentPunctuality(refDate, todayISO);
  const saldoNuevo = Math.max(0, roundMXN(apartado.saldoPendiente - monto));
  const totalAbonado = roundMXN(apartado.totalAbonado + monto);
  const liquidado = saldoNuevo <= 0.009;

  return {
    totalAbonado,
    saldoPendiente: liquidado ? 0 : saldoNuevo,
    estado: liquidado ? 'liquidado' : 'vigente',
    estadoPuntualidad: punctuality.estadoPuntualidad,
    diasAtraso: punctuality.diasAtraso,
  };
}

/**
 * Regla exclusiva de Administrador para aumentar el pago / aplicar recargo a cuentas atrasadas.
 */
export function applyAdminOverdueIncrease(params: {
  montoTotalActual: number;
  saldoPendienteActual: number;
  montoPagoActual?: number;
  recargosActuales?: number;
  incrementoSaldo: number;
  nuevoMontoPago?: number;
}): {
  montoTotal: number;
  saldoPendiente: number;
  montoPago?: number;
  recargosAcumulados: number;
} {
  const incremento = roundMXN(params.incrementoSaldo);
  if (incremento < 0) {
    throw new Error('El aumento al saldo no puede ser negativo.');
  }
  const hasNewQuota =
    typeof params.nuevoMontoPago === 'number' &&
    !Number.isNaN(params.nuevoMontoPago) &&
    params.nuevoMontoPago > 0;

  if (incremento === 0 && !hasNewQuota) {
    throw new Error('Indica un incremento al saldo o una nueva cuota de pago mayor a $0.');
  }

  const saldoPendiente = roundMXN(params.saldoPendienteActual + incremento);
  const montoTotal = roundMXN(params.montoTotalActual + incremento);
  const recargosAcumulados = roundMXN((params.recargosActuales || 0) + incremento);

  let montoPago = params.montoPagoActual;
  if (hasNewQuota) {
    montoPago = roundMXN(params.nuevoMontoPago!);
  } else if (typeof params.montoPagoActual === 'number' && incremento > 0) {
    montoPago = roundMXN(params.montoPagoActual + incremento);
  }

  return {
    montoTotal,
    saldoPendiente,
    montoPago,
    recargosAcumulados,
  };
}

/**
 * Construye el asunto, cuerpo y enlace mailto: para alertas de fecha límite excedida al correo del Administrador.
 */
export function buildOverdueAlertEmail(params: {
  correoAdmin: string;
  nombreTienda: string;
  clienteNombre: string;
  clienteTelefono?: string;
  operacionTipo: 'credito' | 'apartado';
  operacionFolio: string;
  fechaLimite: string;
  diasAtraso: number;
  montoAPagar: number;
  saldoTotalPendiente: number;
}): { subject: string; body: string; mailtoUrl: string } {
  const tipoTxt = params.operacionTipo === 'credito' ? 'Crédito' : 'Apartado';
  const subject = `[ALERTA VENCIMIENTO] ${params.clienteNombre} · ${tipoTxt} ${params.operacionFolio} (${formatMXN(params.montoAPagar)})`;
  const bodyLines = [
    `ALERTA DE PAGO VENCIDO — ${params.nombreTienda.toUpperCase()}`,
    '--------------------------------------------------',
    `Cliente: ${params.clienteNombre}`,
    params.clienteTelefono ? `WhatsApp / Teléfono: ${params.clienteTelefono}` : '',
    `Cuenta: ${tipoTxt} ${params.operacionFolio}`,
    `Fecha límite vencida: ${formatShortDate(params.fechaLimite)} (${params.diasAtraso} día(s) de atraso)`,
    `Monto a pagar: ${formatMXN(params.montoAPagar)}`,
    `Saldo total pendiente: ${formatMXN(params.saldoTotalPendiente)}`,
    '--------------------------------------------------',
    'Notificación generada automáticamente desde el sistema Mueblería Alquia.',
  ].filter(Boolean);

  const body = bodyLines.join('\n');
  const to = (params.correoAdmin || '').trim();
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { subject, body, mailtoUrl };
}

export interface LayawayCancellationOutcome {
  resolucion: Exclude<ResolucionCancelacion, 'ninguna'>;
  montoReembolsado: number;
  montoSaldoAFavor: number;
  montoRetenido: number;
  stockARestaurar: Array<{ productoId: string; cantidad: number }>;
}

export function resolveLayawayCancellation(
  apartado: Apartado,
  resolucion: Exclude<ResolucionCancelacion, 'ninguna'>,
  montoPenalizacion: number = 0
): LayawayCancellationOutcome {
  if (apartado.estado !== 'vigente') {
    throw new Error('Solo se pueden cancelar apartados vigentes.');
  }

  const acumulado = roundMXN(apartado.totalAbonado);
  let montoReembolsado = 0;
  let montoSaldoAFavor = 0;
  let montoRetenido = 0;

  if (resolucion === 'reembolso') {
    montoReembolsado = acumulado;
  } else if (resolucion === 'saldo_a_favor') {
    montoSaldoAFavor = acumulado;
  } else {
    const pen = roundMXN(montoPenalizacion);
    if (pen < 0 || pen > acumulado) {
      throw new Error('La penalización debe estar entre $0 y el total abonado.');
    }
    montoRetenido = pen;
    montoReembolsado = roundMXN(acumulado - pen);
  }

  const stockARestaurar = apartado.items
    .filter((item) => item.productoId && !item.productoId.startsWith('manual-'))
    .map((item) => ({
      productoId: item.productoId,
      cantidad: item.cantidad,
    }));

  return {
    resolucion,
    montoReembolsado,
    montoSaldoAFavor,
    montoRetenido,
    stockARestaurar,
  };
}

export function calculateCartTotals(
  cart: Array<{ producto: Producto; cantidad: number }>,
  tipoVenta: TipoVenta,
  descuento: number = 0,
  saldoAFavorAplicado: number = 0
): {
  items: VentaItem[];
  subtotal: number;
  descuentoAplicado: number;
  saldoAFavorUsado: number;
  total: number;
} {
  const items: VentaItem[] = cart.map(({ producto, cantidad }) => {
    const precioUnitario = tipoVenta === 'contado' ? producto.precioContado : producto.precioCredito;
    return {
      productoId: producto.id,
      sku: producto.sku,
      nombre: producto.nombre,
      cantidad,
      precioUnitario,
      subtotal: roundMXN(precioUnitario * cantidad),
    };
  });

  const subtotal = roundMXN(items.reduce((acc, item) => acc + item.subtotal, 0));
  const descuentoAplicado = Math.min(subtotal, Math.max(0, roundMXN(descuento)));
  const despuesDescuento = roundMXN(subtotal - descuentoAplicado);
  const saldoAFavorUsado = Math.min(despuesDescuento, Math.max(0, roundMXN(saldoAFavorAplicado)));
  const total = roundMXN(despuesDescuento - saldoAFavorUsado);

  return {
    items,
    subtotal,
    descuentoAplicado,
    saldoAFavorUsado,
    total,
  };
}

/**
 * Filtra los productos pertenecientes estrictamente a la base de datos privada de una tienda/sucursal.
 */
export function filterProductosForSucursal(params: {
  productos: Producto[];
  inventarioSucursales: InventarioSucursal[];
  sucursalId?: string;
  includeLegacyWithoutStore?: boolean;
}): Producto[] {
  const { productos, inventarioSucursales, sucursalId, includeLegacyWithoutStore = false } = params;
  if (!sucursalId) return productos;
  const ownProdIds = new Set(
    inventarioSucursales.filter((inv) => inv.sucursalId === sucursalId).map((inv) => inv.productoId)
  );
  return productos.filter((p) => {
    if (p.creadoPorSucursalId === sucursalId) return true;
    if (ownProdIds.has(p.id)) return true;
    if (includeLegacyWithoutStore && !p.creadoPorSucursalId) return true;
    return false;
  });
}

/**
 * Determina en qué tienda se registró un abono y si corresponde a otra tienda distinta a la de origen de la cuenta.
 */
export function resolveAbonoStoreAttribution(params: {
  abono: Pick<
    Abono,
    'sucursalId' | 'sucursalNombre' | 'cuentaSucursalId' | 'cuentaSucursalNombre' | 'enOtraTienda'
  >;
  cuentaSucursalId?: string;
  sucursales: Sucursal[];
}): {
  abonoSucursalNombre: string;
  cuentaSucursalNombre: string;
  enOtraTienda: boolean;
} {
  const { abono, cuentaSucursalId, sucursales } = params;
  const effectiveCuentaSucId = abono.cuentaSucursalId || cuentaSucursalId;
  const abonoStore = abono.sucursalId
    ? sucursales.find((s) => s.id === abono.sucursalId)
    : undefined;
  const cuentaStore = effectiveCuentaSucId
    ? sucursales.find((s) => s.id === effectiveCuentaSucId)
    : undefined;

  const abonoSucursalNombre = (abono.sucursalNombre || abonoStore?.nombre || '').trim();
  const cuentaSucursalNombre = (abono.cuentaSucursalNombre || cuentaStore?.nombre || '').trim();
  const enOtraTienda =
    typeof abono.enOtraTienda === 'boolean'
      ? abono.enOtraTienda
      : Boolean(
          abono.sucursalId &&
            effectiveCuentaSucId &&
            abono.sucursalId !== effectiveCuentaSucId
        );

  return {
    abonoSucursalNombre,
    cuentaSucursalNombre,
    enOtraTienda,
  };
}

/**
 * Calcula las existencias estrictamente privadas de un producto para la tienda actual
 * sin exponer el inventario ni existencias de otras tiendas.
 */
export interface ProductStoreAvailability {
  ownStockDisponible: number;
  ownStockReservado: number;
  ownStockMinimo: number;
  otherStoresWithStock: Array<{ sucursalId: string; sucursalNombre: string; stockDisponible: number }>;
  totalNetworkStock: number;
  statusMessage: string;
}

export function getProductStoreAvailability(params: {
  producto: Producto;
  inventarioSucursales: InventarioSucursal[];
  sucursales: Sucursal[];
  currentSucursalId?: string;
}): ProductStoreAvailability {
  const { producto, inventarioSucursales, sucursales, currentSucursalId } = params;
  const currentStore = sucursales.find((s) => s.id === currentSucursalId);
  const currentStoreName = currentStore?.nombre || 'esta tienda';

  const ownEntry = currentSucursalId
    ? inventarioSucursales.find(
        (inv) => inv.productoId === producto.id && inv.sucursalId === currentSucursalId
      )
    : inventarioSucursales.find((inv) => inv.productoId === producto.id);

  let ownStockDisponible = 0;
  let ownStockReservado = 0;
  let ownStockMinimo = producto.stockMinimo;

  if (ownEntry) {
    ownStockDisponible = ownEntry.stockDisponible;
    ownStockReservado = ownEntry.stockReservado;
    ownStockMinimo = ownEntry.stockMinimo;
  } else {
    const belongsHere =
      !currentSucursalId ||
      !producto.creadoPorSucursalId ||
      producto.creadoPorSucursalId === currentSucursalId;
    ownStockDisponible = belongsHere ? producto.stockDisponible : 0;
    ownStockReservado = belongsHere ? producto.stockReservado : 0;
  }

  const statusMessage =
    ownStockDisponible > 0
      ? `Disponible en ${currentStoreName} (${ownStockDisponible})`
      : `Sin existencias en ${currentStoreName}`;

  return {
    ownStockDisponible,
    ownStockReservado,
    ownStockMinimo,
    otherStoresWithStock: [],
    totalNetworkStock: ownStockDisponible,
    statusMessage,
  };
}

/**
 * Resume únicamente las ventas del día y abonos cobrados por el propietario del turno de caja activo.
 */
export interface CajaShiftSummary {
  ventasDelDia: Venta[];
  abonosDelDia: Abono[];
  totalVentasImporte: number;
  totalPagosIniciales: number;
  totalAbonos: number;
  totalIngresosDia: number;
  porMetodo: {
    efectivo: number;
    tarjeta: number;
    transferencia: number;
  };
  efectivoEsperadoEnCaja: number;
}

export function summarizeCajaShift(
  turno: CajaTurno | null,
  ventas: Venta[],
  abonos: Abono[],
  todayISO: string = todayISODate()
): CajaShiftSummary {
  const sinceISO = turno?.abiertaEn || `${todayISO}T00:00:00.000Z`;
  const ownerUid = turno?.abiertaPorUid || '';

  // Ventas activas/completadas del turno abiertas exclusivamente por el dueño de esta caja
  const ventasDelDia = ventas.filter((v) => {
    if (v.estado === 'cancelada') return false;
    if (ownerUid && v.vendedorUid !== ownerUid) return false;
    if (turno?.abiertaEn) {
      return v.creadoEn >= turno.abiertaEn || v.creadoEn.slice(0, 10) === todayISO;
    }
    return v.creadoEn.slice(0, 10) === todayISO;
  });

  // Abonos cobrados exclusivamente por el dueño de esta caja desde la apertura del turno
  const abonosDelDia = abonos.filter((ab) => {
    if (ownerUid && ab.cobradorUid !== ownerUid) return false;
    if (turno?.abiertaEn) {
      return ab.creadoEn >= sinceISO;
    }
    return ab.creadoEn.slice(0, 10) === todayISO;
  });

  const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  let totalVentasImporte = 0;
  let totalPagosIniciales = 0;

  for (const v of ventasDelDia) {
    totalVentasImporte = roundMXN(totalVentasImporte + v.total);
    totalPagosIniciales = roundMXN(totalPagosIniciales + v.pagoInicial);
    porMetodo[v.metodoPago] = roundMXN(porMetodo[v.metodoPago] + v.pagoInicial);
  }

  let totalAbonos = 0;
  for (const ab of abonosDelDia) {
    totalAbonos = roundMXN(totalAbonos + ab.monto);
    porMetodo[ab.metodoPago] = roundMXN(porMetodo[ab.metodoPago] + ab.monto);
  }

  const totalIngresosDia = roundMXN(totalPagosIniciales + totalAbonos);
  const efectivoEsperadoEnCaja = roundMXN((turno?.fondoInicial || 0) + porMetodo.efectivo);

  return {
    ventasDelDia,
    abonosDelDia,
    totalVentasImporte,
    totalPagosIniciales,
    totalAbonos,
    totalIngresosDia,
    porMetodo,
    efectivoEsperadoEnCaja,
  };
}

export interface StoreTicketHeader {
  nombreComercial?: string;
  ubicacion?: string;
  telefono?: string;
  mensajeTicket?: string;
  sucursalNombre?: string;
  sucursalDireccion?: string;
  encargadoTienda?: string;
}

/**
 * Construye el mensaje de WhatsApp con el formato solicitado para créditos, apartados y ventas,
 * completado con los datos reales de cada cliente, dirección de sucursal y encargado de tienda.
 */
export function buildWhatsAppTicketText(
  ticket: TicketData,
  storeInfo?: StoreTicketHeader
): string {
  const storeName = (storeInfo?.nombreComercial || 'Mueblería Alquia').trim();
  const storeLocation = (
    ticket.sucursalDireccion ||
    storeInfo?.sucursalDireccion ||
    storeInfo?.ubicacion ||
    'Apaseo el Alto, Guanajuato, México'
  ).trim();
  const storePhone = (storeInfo?.telefono || '(413) 166-0420').trim();
  const encargado = (ticket.encargadoTienda || storeInfo?.encargadoTienda || '').trim();
  const storeFooter = (
    storeInfo?.mensajeTicket || 'Conserve este ticket para garantías y aclaraciones.'
  ).trim();

  const tipoLabels: Record<TicketData['tipoDocumento'], string> = {
    venta_contado: 'COMPROBANTE DE VENTA DE CONTADO',
    venta_credito: 'COMPROBANTE DE VENTA A CRÉDITO',
    apartado: 'COMPROBANTE DE APARTADO',
    abono_credito: 'RECIBO DE ABONO A CRÉDITO',
    abono_apartado: 'RECIBO DE ABONO A APARTADO',
    liquidacion_apartado: 'RECIBO DE LIQUIDACIÓN DE APARTADO',
  };

  const lines: string[] = [`🛋️ *${storeName.toUpperCase()}* ✨`, `📍 ${storeLocation}`];
  if (storePhone) {
    lines.push(`📞 Tel: ${storePhone}`);
  }
  lines.push(
    '────────────────────────',
    `🧾 *${tipoLabels[ticket.tipoDocumento]}*`,
    `🔢 Folio: *${ticket.folio}*`,
    `📅 Fecha: ${formatShortDate(ticket.fechaISO)}`,
    `👤 Cliente: ${ticket.clienteNombre}`,
    `🧑‍💼 Atendió: ${ticket.atendidoPor}`
  );

  if (ticket.sucursalNombre) {
    lines.push(
      `🏪 Tienda de cobro: ${ticket.sucursalNombre}${ticket.enOtraTienda ? ' (Otra tienda)' : ''}`
    );
  }

  if (encargado) {
    lines.push(`👔 Encargado de tienda: ${encargado}`);
  }

  if (ticket.referenciaFolio) {
    lines.push(`🔗 Referencia: ${ticket.referenciaFolio}`);
  }

  if (ticket.estadoPuntualidad) {
    lines.push(
      ticket.estadoPuntualidad === 'atrasado'
        ? `⚠️ Estado del pago: ATRASADO (${ticket.diasAtraso || 1} día(s) de retraso)`
        : '✅ Estado del pago: AL DÍA'
    );
  }

  if (ticket.items && ticket.items.length > 0) {
    lines.push('────────────────────────');
    lines.push('📦 *Detalle de artículos:*');
    for (const item of ticket.items) {
      lines.push(`• ${item.cantidad}x ${item.nombre} (${formatMXN(item.subtotal)})`);
    }
  }

  lines.push('────────────────────────');
  if (typeof ticket.saldoAnterior === 'number') {
    lines.push(`💰 Saldo anterior: ${formatMXN(ticket.saldoAnterior)}`);
  } else {
    lines.push(`💰 Total operación: ${formatMXN(ticket.montoTotal)}`);
  }

  if (ticket.descuento && ticket.descuento > 0) {
    lines.push(`🏷️ Descuento: -${formatMXN(ticket.descuento)}`);
  }
  if (ticket.saldoAFavorAplicado && ticket.saldoAFavorAplicado > 0) {
    lines.push(`🎟️ Saldo a favor aplicado: -${formatMXN(ticket.saldoAFavorAplicado)}`);
  }

  lines.push(`💵 *Pago recibido (${ticket.metodoPago}): ${formatMXN(ticket.pagoRecibido)}*`);
  lines.push(`📉 *Saldo pendiente: ${formatMXN(ticket.saldoPendiente)}*`);

  const isLiquidated = roundMXN(ticket.saldoPendiente) <= 0;
  if (isLiquidated) {
    if (ticket.tipoDocumento === 'abono_credito' || ticket.tipoDocumento === 'venta_credito') {
      lines.push('🎉 Plan: CRÉDITO LIQUIDADO TOTALMENTE');
    } else if (
      ticket.tipoDocumento === 'abono_apartado' ||
      ticket.tipoDocumento === 'apartado' ||
      ticket.tipoDocumento === 'liquidacion_apartado'
    ) {
      lines.push('🎉 Plan: APARTADO LIQUIDADO TOTALMENTE');
    } else if (ticket.planInfo) {
      lines.push(`🎉 Plan: ${ticket.planInfo}`);
    }
  } else {
    if (ticket.planInfo) {
      lines.push(`📋 Plan: ${ticket.planInfo}`);
    }
    if (ticket.proximoPagoFecha) {
      lines.push(`📅 *Próximo pago programado: ${formatShortDate(ticket.proximoPagoFecha)}*`);
    }
    if (ticket.fechaLimite) {
      lines.push(`⏳ Fecha límite: ${formatShortDate(ticket.fechaLimite)}`);
    }
  }

  if (ticket.notas) {
    lines.push(`📝 Notas: ${ticket.notas}`);
  }

  lines.push('────────────────────────');
  lines.push(`📌 ${storeFooter}`);
  return lines.join('\n');
}

/**
 * Construye un TicketData completo para cualquier abono registrado (crédito o apartado),
 * integrando el detalle completo de la cuenta del cliente (concepto/artículos, total de la cuenta,
 * total abonado acumulado, saldo anterior, monto abonado y saldo restante).
 */
export function buildAbonoTicketData(params: {
  abono: Abono;
  credito?: Credito | null;
  apartado?: Apartado | null;
  sucursal?: Sucursal | null;
}): TicketData {
  const { abono, credito, apartado, sucursal } = params;
  const isCredito = abono.tipoOperacion === 'credito';
  const liquidado = roundMXN(abono.saldoNuevo) <= 0;

  if (isCredito) {
    const cuentaTotal = credito ? credito.montoTotal : abono.saldoAnterior;
    const cuentaTotalAbonado = credito
      ? roundMXN(Math.max(0, credito.montoTotal - abono.saldoNuevo))
      : abono.monto;
    const planInfo = liquidado
      ? 'CRÉDITO LIQUIDADO TOTALMENTE'
      : credito
        ? `Pago ${credito.pagosRealizados}/${credito.numPagos} (${credito.frecuencia})`
        : undefined;

    return {
      tipoDocumento: 'abono_credito',
      folio: abono.folio,
      referenciaFolio: abono.operacionFolio,
      fechaISO: abono.creadoEn,
      clienteNombre: abono.clienteNombre,
      clienteTelefono: abono.clienteTelefono || credito?.clienteTelefono,
      atendidoPor: abono.cobradorNombre,
      sucursalNombre: abono.sucursalNombre || sucursal?.nombre,
      sucursalDireccion: sucursal?.direccion,
      encargadoTienda: sucursal?.encargadoNombre,
      enOtraTienda:
        typeof abono.enOtraTienda === 'boolean'
          ? abono.enOtraTienda
          : Boolean(abono.sucursalId && credito?.sucursalId && abono.sucursalId !== credito.sucursalId),
      cuentaSucursalNombre: abono.cuentaSucursalNombre,
      metodoPago: abono.metodoPago,
      cuentaConcepto: credito?.itemsResumen || `Cuenta de crédito ${abono.operacionFolio}`,
      cuentaTotal,
      cuentaTotalAbonado,
      cuentaEstado: liquidado ? 'Liquidado' : 'Activo',
      montoTotal: cuentaTotal,
      saldoAnterior: abono.saldoAnterior,
      pagoRecibido: abono.monto,
      saldoPendiente: abono.saldoNuevo,
      proximoPagoFecha: !liquidado ? credito?.proximaFechaPago : undefined,
      estadoPuntualidad: abono.estadoPuntualidad,
      diasAtraso: abono.diasAtraso,
      planInfo,
      notas: abono.notas || undefined,
    };
  }

  const cuentaTotal = apartado ? apartado.montoTotal : abono.saldoAnterior;
  const cuentaTotalAbonado = apartado
    ? roundMXN(Math.max(0, apartado.montoTotal - abono.saldoNuevo))
    : abono.monto;
  const conceptoApartado =
    apartado && apartado.items.length > 0
      ? apartado.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')
      : `Cuenta de apartado ${abono.operacionFolio}`;

  return {
    tipoDocumento: liquidado ? 'liquidacion_apartado' : 'abono_apartado',
    folio: abono.folio,
    referenciaFolio: abono.operacionFolio,
    fechaISO: abono.creadoEn,
    clienteNombre: abono.clienteNombre,
    clienteTelefono: abono.clienteTelefono || apartado?.clienteTelefono,
    atendidoPor: abono.cobradorNombre,
    sucursalNombre: abono.sucursalNombre || sucursal?.nombre,
    sucursalDireccion: sucursal?.direccion,
    encargadoTienda: sucursal?.encargadoNombre,
    enOtraTienda:
      typeof abono.enOtraTienda === 'boolean'
        ? abono.enOtraTienda
        : Boolean(abono.sucursalId && apartado?.sucursalId && abono.sucursalId !== apartado.sucursalId),
    cuentaSucursalNombre: abono.cuentaSucursalNombre,
    metodoPago: abono.metodoPago,
    items: apartado?.items && apartado.items.length > 0 ? apartado.items : undefined,
    cuentaConcepto: conceptoApartado,
    cuentaTotal,
    cuentaTotalAbonado,
    cuentaEstado: liquidado ? 'Liquidado' : 'Vigente',
    montoTotal: cuentaTotal,
    saldoAnterior: abono.saldoAnterior,
    pagoRecibido: abono.monto,
    saldoPendiente: abono.saldoNuevo,
    proximoPagoFecha: !liquidado ? apartado?.proximoPagoFecha : undefined,
    fechaLimite: !liquidado ? apartado?.fechaLimite : undefined,
    estadoPuntualidad: abono.estadoPuntualidad,
    diasAtraso: abono.diasAtraso,
    planInfo: liquidado
      ? 'APARTADO LIQUIDADO TOTALMENTE'
      : apartado?.condiciones || 'Plan de apartado vigente',
    notas: abono.notas || undefined,
  };
}

