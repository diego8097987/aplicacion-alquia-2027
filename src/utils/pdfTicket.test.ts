import test from 'node:test';
import assert from 'node:assert/strict';
import type { Abono, Apartado, Credito, Sucursal } from '../types/pos';
import { buildAbonoTicketData } from './finance';
import { buildReceiptEmailPayload, createFullPageTicketPDFDoc } from './pdfTicket';

const MOCK_SUCURSAL: Sucursal = {
  id: 'suc-1',
  nombre: 'Tienda 1 — Centro',
  direccion: 'Av. Benito Juárez 120, Apaseo el Alto, Gto.',
  encargadoNombre: 'Diego Olivares Hernández',
  propietarioUid: 'admin-1',
  activa: true,
  creadoEn: '2026-01-01T10:00:00.000Z',
};

const MOCK_CONFIG = {
  nombreComercial: 'Mueblería Alquia',
  ubicacion: 'Apaseo el Alto, Guanajuato, México',
  telefono: '(413) 166-0420',
  mensajeTicket: 'Conserve este ticket para garantías y aclaraciones.',
};

test('buildAbonoTicketData assembles complete client credit account details', () => {
  const credito: Credito = {
    id: 'cr-1',
    folio: 'CR-0001',
    ventaId: 'v-1',
    clienteId: 'cli-1',
    clienteNombre: 'Carlos Mendoza',
    clienteTelefono: '4131002000',
    itemsResumen: '1x Sala Modular Velvet Gris',
    montoTotal: 15000,
    enganche: 2000,
    totalAbonado: 4000,
    saldoPendiente: 11000,
    frecuencia: 'quincenal',
    numPagos: 13,
    montoPago: 1000,
    pagosRealizados: 2,
    proximaFechaPago: '2026-12-09',
    estado: 'activo',
    vendedorUid: 'admin-1',
    creadoEn: '2026-11-01T10:00:00.000Z',
  };

  const abono: Abono = {
    id: 'ab-1',
    folio: 'AB-0001',
    tipoOperacion: 'credito',
    operacionId: 'cr-1',
    operacionFolio: 'CR-0001',
    clienteId: 'cli-1',
    clienteNombre: 'Carlos Mendoza',
    clienteTelefono: '4131002000',
    monto: 1000,
    saldoAnterior: 12000,
    saldoNuevo: 11000,
    metodoPago: 'efectivo',
    estadoPuntualidad: 'al_dia',
    diasAtraso: 0,
    notas: 'Abono quincenal',
    cobradorUid: 'admin-1',
    cobradorNombre: 'Administrador Alquia',
    creadoEn: '2026-11-24T12:00:00.000Z',
  };

  const ticket = buildAbonoTicketData({ abono, credito, sucursal: MOCK_SUCURSAL });

  assert.equal(ticket.tipoDocumento, 'abono_credito');
  assert.equal(ticket.folio, 'AB-0001');
  assert.equal(ticket.referenciaFolio, 'CR-0001');
  assert.equal(ticket.cuentaConcepto, '1x Sala Modular Velvet Gris');
  assert.equal(ticket.cuentaTotal, 15000);
  assert.equal(ticket.cuentaTotalAbonado, 4000);
  assert.equal(ticket.saldoAnterior, 12000);
  assert.equal(ticket.pagoRecibido, 1000);
  assert.equal(ticket.saldoPendiente, 11000);
  assert.equal(ticket.encargadoTienda, 'Diego Olivares Hernández');
  assert.equal(ticket.sucursalDireccion, 'Av. Benito Juárez 120, Apaseo el Alto, Gto.');
});

test('buildAbonoTicketData detects liquidated apartado and builds items', () => {
  const apartado: Apartado = {
    id: 'ap-1',
    folio: 'AP-0001',
    ventaId: 'v-2',
    clienteId: 'cli-2',
    clienteNombre: 'Lucía Pérez',
    clienteTelefono: '4135556677',
    items: [
      {
        productoId: 'prod-1',
        sku: 'COM-01',
        nombre: 'Comedor Cedro 6 Sillas',
        cantidad: 1,
        precioUnitario: 9000,
        subtotal: 9000,
      },
    ],
    montoTotal: 9000,
    anticipoInicial: 3000,
    totalAbonado: 9000,
    saldoPendiente: 0,
    fechaLimite: '2026-12-30',
    condiciones: '30 días',
    estado: 'liquidado',
    resolucionCancelacion: 'ninguna',
    montoRetenido: 0,
    vendedorUid: 'admin-1',
    creadoEn: '2026-11-01T10:00:00.000Z',
  };

  const abono: Abono = {
    id: 'ab-2',
    folio: 'AB-0002',
    tipoOperacion: 'apartado',
    operacionId: 'ap-1',
    operacionFolio: 'AP-0001',
    clienteId: 'cli-2',
    clienteNombre: 'Lucía Pérez',
    monto: 6000,
    saldoAnterior: 6000,
    saldoNuevo: 0,
    metodoPago: 'transferencia',
    estadoPuntualidad: 'al_dia',
    diasAtraso: 0,
    notas: '',
    cobradorUid: 'admin-1',
    cobradorNombre: 'Administrador Alquia',
    creadoEn: '2026-11-24T13:00:00.000Z',
  };

  const ticket = buildAbonoTicketData({ abono, apartado, sucursal: MOCK_SUCURSAL });

  assert.equal(ticket.tipoDocumento, 'liquidacion_apartado');
  assert.equal(ticket.cuentaConcepto, '1x Comedor Cedro 6 Sillas');
  assert.equal(ticket.cuentaTotal, 9000);
  assert.equal(ticket.cuentaTotalAbonado, 9000);
  assert.equal(ticket.saldoPendiente, 0);
  assert.equal(ticket.cuentaEstado, 'Liquidado');
});

test('buildReceiptEmailPayload and createFullPageTicketPDFDoc produce valid output for abono', () => {
  const abono: Abono = {
    id: 'ab-3',
    folio: 'AB-0003',
    tipoOperacion: 'credito',
    operacionId: 'cr-1',
    operacionFolio: 'CR-0001',
    clienteId: 'cli-1',
    clienteNombre: 'Carlos Mendoza',
    clienteTelefono: '4131002000',
    monto: 1000,
    saldoAnterior: 12000,
    saldoNuevo: 11000,
    metodoPago: 'efectivo',
    estadoPuntualidad: 'al_dia',
    diasAtraso: 0,
    notas: 'Pago en mostrador',
    cobradorUid: 'admin-1',
    cobradorNombre: 'Administrador Alquia',
    creadoEn: '2026-11-24T12:00:00.000Z',
  };

  const ticket = buildAbonoTicketData({ abono, sucursal: MOCK_SUCURSAL });
  const email = buildReceiptEmailPayload(ticket, MOCK_CONFIG, 'carlos@correo.com');

  assert.equal(email.to, 'carlos@correo.com');
  assert.match(email.subject, /RECIBO DE ABONO A CRÉDITO AB-0003/);
  assert.match(email.body, /MONTO ABONADO: \$1,000\.00/);
  assert.match(email.body, /SALDO RESTANTE: \$11,000\.00/);
  assert.match(email.body, /DETALLE DE LA CUENTA DEL CLIENTE/);
  assert.match(email.mailtoUrl, /^mailto:carlos%40correo\.com\?subject=/);

  const doc = createFullPageTicketPDFDoc(ticket, MOCK_CONFIG);
  const pdfOutput = doc.output('datauristring');
  assert.ok(pdfOutput.startsWith('data:application/pdf'));
  assert.ok(pdfOutput.length > 500);
});
