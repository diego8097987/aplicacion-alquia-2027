import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdminOverdueIncrease,
  applyPaymentToCredit,
  applyPaymentToLayaway,
  buildOverdueAlertEmail,
  buildWhatsAppLink,
  buildWhatsAppTicketText,
  calculateCartTotals,
  calculateCreditPlan,
  evaluatePaymentPunctuality,
  filterProductosForSucursal,
  getCreditHealth,
  getLayawayHealth,
  getProductStoreAvailability,
  resolveAbonoStoreAttribution,
  resolveLayawayCancellation,
  summarizeCajaShift,
} from './finance';
import {
  DEFAULT_ALERT_BODY_TEMPLATE,
  DEFAULT_ALERT_SUBJECT_TEMPLATE,
  evaluateDueAlerts,
  renderAlertTemplate,
} from './alertsMonitor';
import type {
  Abono,
  Apartado,
  CajaTurno,
  Credito,
  InventarioSucursal,
  Producto,
  Sucursal,
  Venta,
} from '../types/pos';

const sampleProduct: Producto = {
  id: 'prod-1',
  sku: 'SALA-01',
  nombre: 'Sala Modular Turín 3 Piezas',
  categoria: 'Salas',
  marca: 'Alquia Home',
  precioContado: 12500,
  precioCredito: 14800,
  costoUnitario: 8200,
  stockDisponible: 4,
  stockReservado: 1,
  stockMinimo: 2,
  proveedorId: 'prov-1',
  activo: true,
  creadoEn: '2026-11-01T10:00:00Z',
};

test('calculateCreditPlan usa precio fijo y cuadra al centavo', () => {
  const plan = calculateCreditPlan(10000, 1000, 'semanal', 12, '2026-11-01');
  assert.equal(plan.montoFinanciado, 9000);
  assert.equal(plan.montoPago, 750);
  assert.equal(plan.proximaFechaPago, '2026-11-08');
  assert.equal(plan.schedule.length, 12);

  const sumSchedule = plan.schedule.reduce((acc, s) => acc + s.monto, 0);
  assert.equal(Math.round(sumSchedule * 100) / 100, 9000);
});

test('calculateCreditPlan soporta fecha personalizada para el primer pago', () => {
  const plan = calculateCreditPlan(5000, 500, 'quincenal', 7, '2026-11-01', '2026-11-10');
  assert.equal(plan.montoFinanciado, 4500);
  assert.equal(plan.proximaFechaPago, '2026-11-10');
  const sum = Math.round(plan.schedule.reduce((acc, s) => acc + s.monto, 0) * 100) / 100;
  assert.equal(sum, 4500);
});

test('evaluatePaymentPunctuality clasifica pagos al día y pagos atrasados con días exactos', () => {
  const onTime = evaluatePaymentPunctuality('2026-11-25', '2026-11-23');
  assert.equal(onTime.estadoPuntualidad, 'al_dia');
  assert.equal(onTime.diasAtraso, 0);

  const sameDay = evaluatePaymentPunctuality('2026-11-23', '2026-11-23');
  assert.equal(sameDay.estadoPuntualidad, 'al_dia');
  assert.equal(sameDay.diasAtraso, 0);

  const late = evaluatePaymentPunctuality('2026-11-18', '2026-11-23');
  assert.equal(late.estadoPuntualidad, 'atrasado');
  assert.equal(late.diasAtraso, 5);
});

test('getCreditHealth clasifica vencidos, por vencer, al corriente y liquidados', () => {
  assert.equal(
    getCreditHealth({ estado: 'activo', saldoPendiente: 1000, proximaFechaPago: '2026-11-20' }, '2026-11-23').health,
    'vencido'
  );
  assert.equal(
    getCreditHealth({ estado: 'activo', saldoPendiente: 1000, proximaFechaPago: '2026-11-28' }, '2026-11-23').health,
    'por_vencer'
  );
  assert.equal(
    getCreditHealth({ estado: 'activo', saldoPendiente: 1000, proximaFechaPago: '2026-12-10' }, '2026-11-23').health,
    'al_corriente'
  );
  assert.equal(
    getCreditHealth({ estado: 'liquidado', saldoPendiente: 0, proximaFechaPago: '2026-11-20' }, '2026-11-23').health,
    'liquidado'
  );
});

test('applyPaymentToCredit soporta fecha manual de próximo pago y registra puntualidad', () => {
  const credito: Credito = {
    id: 'cr-1',
    folio: 'CR-0001',
    ventaId: 'v-1',
    clienteId: 'cli-1',
    clienteNombre: 'María López',
    clienteTelefono: '4131001122',
    itemsResumen: '1x Sala Modular Turín',
    montoTotal: 14800,
    enganche: 2800,
    totalAbonado: 2800,
    saldoPendiente: 12000,
    frecuencia: 'semanal',
    numPagos: 12,
    montoPago: 1000,
    pagosRealizados: 0,
    proximaFechaPago: '2026-11-20',
    estado: 'activo',
    vendedorUid: 'u1',
    creadoEn: '2026-11-18T12:00:00Z',
  };

  const resLate = applyPaymentToCredit(credito, 1000, '2026-11-23', '2026-12-05');
  assert.equal(resLate.saldoPendiente, 11000);
  assert.equal(resLate.proximaFechaPago, '2026-12-05');
  assert.equal(resLate.estadoPuntualidad, 'atrasado');
  assert.equal(resLate.diasAtraso, 3);

  const resFull = applyPaymentToCredit(credito, 12000, '2026-11-23');
  assert.equal(resFull.saldoPendiente, 0);
  assert.equal(resFull.estado, 'liquidado');
});

test('applyAdminOverdueIncrease calcula aumento de saldo y cuota exclusiva de Administrador', () => {
  const res = applyAdminOverdueIncrease({
    montoTotalActual: 10000,
    saldoPendienteActual: 6000,
    montoPagoActual: 500,
    recargosActuales: 100,
    incrementoSaldo: 250,
    nuevoMontoPago: 650,
  });
  assert.equal(res.montoTotal, 10250);
  assert.equal(res.saldoPendiente, 6250);
  assert.equal(res.montoPago, 650);
  assert.equal(res.recargosAcumulados, 350);

  assert.throws(() =>
    applyAdminOverdueIncrease({
      montoTotalActual: 10000,
      saldoPendienteActual: 6000,
      incrementoSaldo: -50,
    })
  );
});

test('buildOverdueAlertEmail arma correo con nombre del cliente y monto a pagar', () => {
  const email = buildOverdueAlertEmail({
    correoAdmin: 'admin@alquia.mx',
    nombreTienda: 'Mueblería Alquia',
    clienteNombre: 'Roberto Sánchez',
    clienteTelefono: '4131234567',
    operacionTipo: 'credito',
    operacionFolio: 'CR-0005',
    fechaLimite: '2026-11-15',
    diasAtraso: 8,
    montoAPagar: 950,
    saldoTotalPendiente: 4750,
  });

  assert.match(email.subject, /Roberto Sánchez/);
  assert.match(email.subject, /950\.00/);
  assert.match(email.body, /CR-0005/);
  assert.match(email.body, /8 día\(s\)/);
  assert.match(email.mailtoUrl, /^mailto:admin%40alquia\.mx\?/);
});

test('applyPaymentToLayaway y getLayawayHealth manejan apartados y puntualidad', () => {
  const apartado: Apartado = {
    id: 'ap-1',
    folio: 'AP-0001',
    ventaId: 'v-2',
    clienteId: 'cli-2',
    clienteNombre: 'Carlos Ramírez',
    clienteTelefono: '4132003344',
    items: [
      {
        productoId: 'prod-1',
        sku: 'SALA-01',
        nombre: 'Sala Modular Turín',
        cantidad: 1,
        precioUnitario: 14800,
        subtotal: 14800,
      },
    ],
    montoTotal: 14800,
    anticipoInicial: 3000,
    totalAbonado: 3000,
    saldoPendiente: 11800,
    fechaLimite: '2026-11-27',
    condiciones: 'Plazo máximo 30 días',
    estado: 'vigente',
    resolucionCancelacion: 'ninguna',
    montoRetenido: 0,
    vendedorUid: 'u1',
    creadoEn: '2026-11-01T12:00:00Z',
  };

  assert.equal(getLayawayHealth(apartado, '2026-11-23').health, 'por_vencer');

  const abono1 = applyPaymentToLayaway(apartado, 5000, '2026-11-23');
  assert.equal(abono1.saldoPendiente, 6800);
  assert.equal(abono1.estado, 'vigente');
  assert.equal(abono1.estadoPuntualidad, 'al_dia');

  const liquidar = applyPaymentToLayaway(apartado, 11800, '2026-12-01');
  assert.equal(liquidar.saldoPendiente, 0);
  assert.equal(liquidar.estado, 'liquidado');
  assert.equal(liquidar.estadoPuntualidad, 'atrasado');
  assert.equal(liquidar.diasAtraso, 4);
});

test('resolveLayawayCancellation aplica reembolso, saldo a favor o penalización y devuelve stock', () => {
  const apartado: Apartado = {
    id: 'ap-2',
    folio: 'AP-0002',
    ventaId: 'v-3',
    clienteId: 'cli-2',
    clienteNombre: 'Carlos Ramírez',
    clienteTelefono: '4132003344',
    items: [
      {
        productoId: 'prod-1',
        sku: 'SALA-01',
        nombre: 'Sala Modular Turín',
        cantidad: 2,
        precioUnitario: 14800,
        subtotal: 29600,
      },
    ],
    montoTotal: 29600,
    anticipoInicial: 4000,
    totalAbonado: 6000,
    saldoPendiente: 23600,
    fechaLimite: '2026-12-15',
    condiciones: 'Plazo 45 días',
    estado: 'vigente',
    resolucionCancelacion: 'ninguna',
    montoRetenido: 0,
    vendedorUid: 'u1',
    creadoEn: '2026-11-01T12:00:00Z',
  };

  const r1 = resolveLayawayCancellation(apartado, 'reembolso');
  assert.equal(r1.montoReembolsado, 6000);
  assert.equal(r1.stockARestaurar[0].cantidad, 2);

  const r2 = resolveLayawayCancellation(apartado, 'saldo_a_favor');
  assert.equal(r2.montoSaldoAFavor, 6000);

  const r3 = resolveLayawayCancellation(apartado, 'penalizacion', 1200);
  assert.equal(r3.montoRetenido, 1200);
  assert.equal(r3.montoReembolsado, 4800);
});

test('calculateCartTotals, buildWhatsAppLink y buildWhatsAppTicketText funcionan correctamente', () => {
  const contado = calculateCartTotals([{ producto: sampleProduct, cantidad: 1 }], 'contado', 500, 1000);
  assert.equal(contado.total, 11000);

  const waUrl = buildWhatsAppLink('4131001122', 'Hola Alquia');
  assert.match(waUrl, /^https:\/\/wa\.me\/524131001122\?text=/);

  const text = buildWhatsAppTicketText({
    tipoDocumento: 'abono_credito',
    folio: 'AB-0014',
    referenciaFolio: 'CR-0001',
    fechaISO: '2026-11-23T18:00:00Z',
    clienteNombre: 'María López',
    atendidoPor: 'Laura Mendoza',
    metodoPago: 'efectivo',
    montoTotal: 14800,
    saldoAnterior: 5000,
    pagoRecibido: 1000,
    saldoPendiente: 4000,
    proximoPagoFecha: '2026-11-30',
    estadoPuntualidad: 'al_dia',
  });

  assert.match(text, /🛋️ \*MUEBLERÍA ALQUIA\* ✨/);
  assert.match(text, /🧾 \*RECIBO DE ABONO A CRÉDITO\*/);
  assert.match(text, /AB-0014/);
  assert.match(text, /AL DÍA/);
  assert.match(text, /Próximo pago programado/);
});

test('buildWhatsAppTicketText formatea recibos liquidados de crédito y apartado con dirección de sucursal y encargado', () => {
  const creditoLiq = buildWhatsAppTicketText(
    {
      tipoDocumento: 'abono_credito',
      folio: 'AB-0006',
      referenciaFolio: 'CR-0001',
      fechaISO: '2026-11-24T16:00:00Z',
      clienteNombre: 'diego',
      atendidoPor: 'Diego Olivares Hernández',
      sucursalNombre: 'Tienda 2 — Norte',
      enOtraTienda: true,
      encargadoTienda: 'Laura Cobrador',
      sucursalDireccion: 'Blvd. Norte #250, Apaseo el Alto, Gto.',
      metodoPago: 'efectivo',
      montoTotal: 40991.3,
      saldoAnterior: 40991.3,
      pagoRecibido: 40991.3,
      saldoPendiente: 0,
      estadoPuntualidad: 'al_dia',
    },
    {
      nombreComercial: 'Mueblería Alquia',
      telefono: '(413) 166-0420',
    }
  );

  assert.match(creditoLiq, /🛋️ \*MUEBLERÍA ALQUIA\* ✨/);
  assert.match(creditoLiq, /📍 Blvd\. Norte #250, Apaseo el Alto, Gto\./);
  assert.match(creditoLiq, /🧑‍💼 Atendió: Diego Olivares Hernández/);
  assert.match(creditoLiq, /🏪 Tienda de cobro: Tienda 2 — Norte \(Otra tienda\)/);
  assert.match(creditoLiq, /👔 Encargado de tienda: Laura Cobrador/);
  assert.match(creditoLiq, /🎉 Plan: CRÉDITO LIQUIDADO TOTALMENTE/);

  const apartadoLiq = buildWhatsAppTicketText({
    tipoDocumento: 'abono_apartado',
    folio: 'AB-0007',
    referenciaFolio: 'AP-0002',
    fechaISO: '2026-11-24T16:30:00Z',
    clienteNombre: 'Ana Torres',
    atendidoPor: 'Laura Cobrador',
    metodoPago: 'transferencia',
    montoTotal: 15000,
    saldoAnterior: 3500,
    pagoRecibido: 3500,
    saldoPendiente: 0,
    estadoPuntualidad: 'al_dia',
  });

  assert.match(apartadoLiq, /🧾 \*RECIBO DE ABONO A APARTADO\*/);
  assert.match(apartadoLiq, /🎉 Plan: APARTADO LIQUIDADO TOTALMENTE/);
});

test('getProductStoreAvailability y filterProductosForSucursal aíslan estrictamente el inventario privado de cada tienda', () => {
  const sucursales: Sucursal[] = [
    {
      id: 'suc-1',
      nombre: 'Tienda 1 — Centro',
      direccion: 'Av. Juárez #100',
      encargadoNombre: 'Diego Olivares',
      propietarioUid: 'u-admin',
      activa: true,
      creadoEn: '2026-11-01T10:00:00Z',
    },
    {
      id: 'suc-2',
      nombre: 'Tienda 2 — Norte',
      direccion: 'Blvd. Norte #250',
      encargadoNombre: 'Laura Cobrador',
      propietarioUid: 'u-cobrador',
      activa: true,
      creadoEn: '2026-11-01T10:00:00Z',
    },
  ];

  const prodStore1: Producto = { ...sampleProduct, id: 'prod-1', creadoPorSucursalId: 'suc-1' };
  const prodStore2: Producto = {
    ...sampleProduct,
    id: 'prod-2',
    sku: 'COM-02',
    nombre: 'Comedor Cedro 6 Sillas',
    creadoPorSucursalId: 'suc-2',
  };

  const invSucursales: InventarioSucursal[] = [
    {
      id: 'suc-1__prod-1',
      sucursalId: 'suc-1',
      sucursalNombre: 'Tienda 1 — Centro',
      productoId: 'prod-1',
      propietarioUid: 'u-admin',
      stockDisponible: 90,
      stockReservado: 0,
      stockMinimo: 2,
      actualizadoEn: '2026-11-24T10:00:00Z',
    },
    {
      id: 'suc-2__prod-2',
      sucursalId: 'suc-2',
      sucursalNombre: 'Tienda 2 — Norte',
      productoId: 'prod-2',
      propietarioUid: 'u-cobrador',
      stockDisponible: 5,
      stockReservado: 0,
      stockMinimo: 1,
      actualizadoEn: '2026-11-24T10:00:00Z',
    },
  ];

  const scopedStore1 = filterProductosForSucursal({
    productos: [prodStore1, prodStore2],
    inventarioSucursales: invSucursales,
    sucursalId: 'suc-1',
  });
  assert.deepEqual(scopedStore1.map((p) => p.id), ['prod-1']);

  const scopedStore2 = filterProductosForSucursal({
    productos: [prodStore1, prodStore2],
    inventarioSucursales: invSucursales,
    sucursalId: 'suc-2',
  });
  assert.deepEqual(scopedStore2.map((p) => p.id), ['prod-2']);

  const tienda2ViewOfStore1Product = getProductStoreAvailability({
    producto: prodStore1,
    inventarioSucursales: invSucursales,
    sucursales,
    currentSucursalId: 'suc-2',
  });

  // Tienda 2 jamás debe ver stock ni disponibilidad de Tienda 1
  assert.equal(tienda2ViewOfStore1Product.ownStockDisponible, 0);
  assert.equal(tienda2ViewOfStore1Product.otherStoresWithStock.length, 0);
  assert.equal(tienda2ViewOfStore1Product.totalNetworkStock, 0);
  assert.match(tienda2ViewOfStore1Product.statusMessage, /Sin existencias en Tienda 2 — Norte/);

  const tienda1View = getProductStoreAvailability({
    producto: prodStore1,
    inventarioSucursales: invSucursales,
    sucursales,
    currentSucursalId: 'suc-1',
  });

  assert.equal(tienda1View.ownStockDisponible, 90);
  assert.equal(tienda1View.otherStoresWithStock.length, 0);
  assert.match(tienda1View.statusMessage, /Disponible en Tienda 1 — Centro \(90\)/);
});

test('summarizeCajaShift consolida ventas del día, abonos con cliente/monto y efectivo esperado en caja', () => {
  const turno: CajaTurno = {
    id: 'caja-1',
    sucursalId: 'suc-1',
    sucursalNombre: 'Tienda 1 — Centro',
    abiertaPorUid: 'u-1',
    abiertaPorNombre: 'Laura Cobrador',
    fondoInicial: 1500,
    abiertaEn: '2026-11-24T09:00:00.000Z',
    estado: 'abierta',
  };

  const ventas: Venta[] = [
    {
      id: 'v-1',
      folio: 'V-0001',
      tipo: 'contado',
      clienteId: 'cli-1',
      clienteNombre: 'Juan Pérez',
      clienteTelefono: '4131002200',
      items: [],
      subtotal: 5000,
      descuento: 0,
      saldoAFavorAplicado: 0,
      total: 5000,
      metodoPago: 'efectivo',
      pagoInicial: 5000,
      estado: 'completada',
      vendedorUid: 'u-1',
      vendedorNombre: 'Laura Cobrador',
      creadoEn: '2026-11-24T10:30:00.000Z',
    },
    {
      id: 'v-2',
      folio: 'V-0002',
      tipo: 'contado',
      clienteId: 'cli-2',
      clienteNombre: 'Cancelada',
      clienteTelefono: '4131002299',
      items: [],
      subtotal: 2000,
      descuento: 0,
      saldoAFavorAplicado: 0,
      total: 2000,
      metodoPago: 'tarjeta',
      pagoInicial: 2000,
      estado: 'cancelada',
      vendedorUid: 'u-1',
      vendedorNombre: 'Laura Cobrador',
      creadoEn: '2026-11-24T11:00:00.000Z',
    },
    {
      id: 'v-3-other-user',
      folio: 'V-0003',
      tipo: 'contado',
      clienteId: 'cli-3',
      clienteNombre: 'Otro Vendedor',
      clienteTelefono: '4131002288',
      items: [],
      subtotal: 9999,
      descuento: 0,
      saldoAFavorAplicado: 0,
      total: 9999,
      metodoPago: 'efectivo',
      pagoInicial: 9999,
      estado: 'completada',
      vendedorUid: 'u-otro',
      vendedorNombre: 'Otro Personal',
      creadoEn: '2026-11-24T11:30:00.000Z',
    },
  ];

  const abonos: Abono[] = [
    {
      id: 'ab-1',
      folio: 'AB-0001',
      tipoOperacion: 'credito',
      operacionId: 'cr-1',
      operacionFolio: 'CR-0001',
      clienteId: 'cli-1',
      clienteNombre: 'Carlos Mendoza',
      monto: 1200,
      metodoPago: 'efectivo',
      saldoAnterior: 8000,
      saldoNuevo: 6800,
      estadoPuntualidad: 'al_dia',
      diasAtraso: 0,
      notas: '',
      cobradorUid: 'u-1',
      cobradorNombre: 'Laura Cobrador',
      creadoEn: '2026-11-24T12:15:00.000Z',
    },
    {
      id: 'ab-2',
      folio: 'AB-0002',
      tipoOperacion: 'apartado',
      operacionId: 'ap-1',
      operacionFolio: 'AP-0001',
      clienteId: 'cli-2',
      clienteNombre: 'Sofía Ruiz',
      monto: 800,
      metodoPago: 'transferencia',
      saldoAnterior: 3000,
      saldoNuevo: 2200,
      estadoPuntualidad: 'al_dia',
      diasAtraso: 0,
      notas: '',
      cobradorUid: 'u-1',
      cobradorNombre: 'Laura Cobrador',
      creadoEn: '2026-11-24T13:00:00.000Z',
    },
    {
      id: 'ab-3-other-user',
      folio: 'AB-0003',
      tipoOperacion: 'credito',
      operacionId: 'cr-9',
      operacionFolio: 'CR-0009',
      clienteId: 'cli-9',
      clienteNombre: 'Otro Cobrador',
      monto: 4500,
      metodoPago: 'efectivo',
      saldoAnterior: 5000,
      saldoNuevo: 500,
      estadoPuntualidad: 'al_dia',
      diasAtraso: 0,
      notas: '',
      cobradorUid: 'u-otro',
      cobradorNombre: 'Otro Personal',
      creadoEn: '2026-11-24T13:30:00.000Z',
    },
  ];

  const summary = summarizeCajaShift(turno, ventas, abonos, '2026-11-24');
  // Solo debe sumar ventas y abonos del propietario de la caja (u-1), excluyendo u-otro
  assert.equal(summary.ventasDelDia.length, 1);
  assert.equal(summary.abonosDelDia.length, 2);
  assert.equal(summary.abonosDelDia[0].clienteNombre, 'Carlos Mendoza');
  assert.equal(summary.abonosDelDia[0].monto, 1200);
  assert.equal(summary.totalPagosIniciales, 5000);
  assert.equal(summary.totalAbonos, 2000);
  assert.equal(summary.totalIngresosDia, 7000);
  assert.equal(summary.porMetodo.efectivo, 6200);
  assert.equal(summary.porMetodo.transferencia, 800);
  assert.equal(summary.efectivoEsperadoEnCaja, 7700);
});

test('resolveAbonoStoreAttribution detecta pagos realizados en otra tienda y conserva el nombre de sucursal', () => {
  const sucursales: Sucursal[] = [
    {
      id: 'suc-1',
      nombre: 'Tienda 1 — Centro',
      direccion: 'Av. Juárez #100',
      encargadoNombre: 'Diego Olivares',
      propietarioUid: 'u-admin',
      activa: true,
      creadoEn: '2026-11-01T10:00:00Z',
    },
    {
      id: 'suc-2',
      nombre: 'Tienda 2 — Norte',
      direccion: 'Blvd. Norte #250',
      encargadoNombre: 'Laura Cobrador',
      propietarioUid: 'u-cobrador',
      activa: true,
      creadoEn: '2026-11-01T10:00:00Z',
    },
  ];

  const crossStore = resolveAbonoStoreAttribution({
    abono: {
      sucursalId: 'suc-2',
      sucursalNombre: 'Tienda 2 — Norte',
      cuentaSucursalId: 'suc-1',
      cuentaSucursalNombre: 'Tienda 1 — Centro',
      enOtraTienda: true,
    },
    cuentaSucursalId: 'suc-1',
    sucursales,
  });

  assert.equal(crossStore.enOtraTienda, true);
  assert.equal(crossStore.abonoSucursalNombre, 'Tienda 2 — Norte');
  assert.equal(crossStore.cuentaSucursalNombre, 'Tienda 1 — Centro');

  const sameStore = resolveAbonoStoreAttribution({
    abono: {
      sucursalId: 'suc-1',
      sucursalNombre: 'Tienda 1 — Centro',
    },
    cuentaSucursalId: 'suc-1',
    sucursales,
  });

  assert.equal(sameStore.enOtraTienda, false);
  assert.equal(sameStore.abonoSucursalNombre, 'Tienda 1 — Centro');
});

test('evaluateDueAlerts y renderAlertTemplate detectan vencidos/próximos y evitan duplicados diarios', () => {
  const creditos: Credito[] = [
    {
      id: 'cr-late',
      folio: 'CR-0001',
      ventaId: 'v-1',
      clienteId: 'cli-1',
      clienteNombre: 'Carlos Mendoza',
      clienteTelefono: '4131002233',
      itemsResumen: '1x Sala Roma',
      montoTotal: 15000,
      enganche: 3000,
      totalAbonado: 3000,
      saldoPendiente: 12000,
      frecuencia: 'semanal',
      numPagos: 12,
      montoPago: 1000,
      pagosRealizados: 0,
      proximaFechaPago: '2026-11-20',
      estado: 'activo',
      vendedorUid: 'u1',
      creadoEn: '2026-11-01T10:00:00Z',
    },
  ];

  const apartados: Apartado[] = [
    {
      id: 'ap-soon',
      folio: 'AP-0002',
      ventaId: 'v-2',
      clienteId: 'cli-2',
      clienteNombre: 'Elena Soto',
      clienteTelefono: '4132004455',
      items: [],
      montoTotal: 9000,
      anticipoInicial: 2000,
      totalAbonado: 2000,
      saldoPendiente: 7000,
      fechaLimite: '2026-11-26',
      condiciones: '30 días',
      estado: 'vigente',
      resolucionCancelacion: 'ninguna',
      montoRetenido: 0,
      vendedorUid: 'u1',
      creadoEn: '2026-11-05T10:00:00Z',
    },
  ];

  const firstRun = evaluateDueAlerts({
    creditos,
    apartados,
    existingAlerts: [],
    diasAnticipacion: 3,
    todayISO: '2026-11-24',
    correoDestino: 'muebleriaalquia@gmail.com',
    nombreTienda: 'Mueblería Alquia',
    plantillaAsunto: DEFAULT_ALERT_SUBJECT_TEMPLATE,
    plantillaCuerpo: DEFAULT_ALERT_BODY_TEMPLATE,
  });

  assert.equal(firstRun.length, 2);
  assert.equal(firstRun[0].tipoAlerta, 'vencido');
  assert.equal(firstRun[0].diasAtraso, 4);
  assert.match(firstRun[0].asunto, /Carlos Mendoza/);
  assert.match(firstRun[0].mensaje, /\$12,000\.00/);

  assert.equal(firstRun[1].tipoAlerta, 'por_vencer');
  assert.equal(firstRun[1].diasRestantes, 2);
  assert.match(firstRun[1].asunto, /Elena Soto/);

  const renderedCustom = renderAlertTemplate('Cliente {{clienteNombre}} debe {{montoPendiente}}', {
    estado: 'VENCIDO',
    clienteNombre: 'Carlos Mendoza',
    clienteTelefono: '4131002233',
    tipoCuenta: 'Crédito',
    folio: 'CR-0001',
    fechaLimite: '20 nov 2026',
    montoAPagar: '$1,000.00',
    montoPendiente: '$12,000.00',
    nombreTienda: 'Mueblería Alquia',
  });
  assert.equal(renderedCustom, 'Cliente Carlos Mendoza debe $12,000.00');

  // Deduplication check: if CR-0001 already logged today, only AP-0002 remains
  const secondRun = evaluateDueAlerts({
    creditos,
    apartados,
    existingAlerts: [
      {
        id: 'al-1',
        claveAlerta: firstRun[0].claveAlerta,
        tipoAlerta: 'vencido',
        operacionTipo: 'credito',
        operacionId: 'cr-late',
        operacionFolio: 'CR-0001',
        clienteId: 'cli-1',
        clienteNombre: 'Carlos Mendoza',
        clienteTelefono: '4131002233',
        montoAPagar: 1000,
        fechaLimite: '2026-11-20',
        diasAtraso: 4,
        correoDestino: 'muebleriaalquia@gmail.com',
        asunto: firstRun[0].asunto,
        mensaje: firstRun[0].mensaje,
        estado: 'enviada',
        creadoPorUid: 'u1',
        creadoEn: '2026-11-24T08:00:00Z',
      },
    ],
    diasAnticipacion: 3,
    todayISO: '2026-11-24',
    correoDestino: 'muebleriaalquia@gmail.com',
    nombreTienda: 'Mueblería Alquia',
  });

  assert.equal(secondRun.length, 1);
  assert.equal(secondRun[0].operacionFolio, 'AP-0002');
});

