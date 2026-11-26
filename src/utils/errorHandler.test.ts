import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppValidationError,
  clearErrorLogs,
  exportErrorLogsJSON,
  formatFriendlyErrorMessage,
  getErrorLogs,
  logAppError,
  safeExecute,
  validateAbonoInput,
  validateApartadoInput,
  validateCajaFondoInicial,
  validateCreditoInput,
  validateISODate,
  validatePhoneWhatsApp,
  validateProductoInput,
} from './errorHandler';

test('validaciones de datos rechazan inconsistencias y aceptan entradas válidas', () => {
  // Producto válido
  assert.doesNotThrow(() =>
    validateProductoInput({
      sku: 'SALA-01',
      nombre: 'Sala Roma',
      precioContado: 12000,
      precioCredito: 14500,
      costoUnitario: 8000,
      stockDisponible: 5,
      stockMinimo: 2,
    })
  );

  // Stock negativo o decimal rechazado
  assert.throws(
    () =>
      validateProductoInput({
        sku: 'SALA-01',
        nombre: 'Sala Roma',
        precioContado: 12000,
        precioCredito: 14500,
        costoUnitario: 8000,
        stockDisponible: -3,
        stockMinimo: 2,
      }),
    AppValidationError
  );

  // Crédito con enganche >= total rechazado
  assert.throws(
    () =>
      validateCreditoInput({
        clienteId: 'cli-1',
        descripcion: 'Comedor',
        montoTotal: 10000,
        enganche: 10000,
        metodoPago: 'efectivo',
        numPagos: 10,
      }),
    AppValidationError
  );

  // Apartado con fecha de calendario inexistente rechazado
  assert.throws(
    () =>
      validateApartadoInput({
        clienteId: 'cli-1',
        descripcion: 'Recámara',
        montoTotal: 8000,
        anticipoInicial: 1000,
        metodoPago: 'efectivo',
        fechaLimite: '2026-02-31',
      }),
    AppValidationError
  );

  // Abono superior al saldo pendiente rechazado
  assert.throws(
    () =>
      validateAbonoInput({
        monto: 1500,
        saldoPendiente: 1000,
        metodoPago: 'efectivo',
      }),
    AppValidationError
  );

  // Teléfono WhatsApp válido e inválido
  assert.equal(validatePhoneWhatsApp('413-166-0420', true), '413-166-0420');
  assert.throws(() => validatePhoneWhatsApp('12345', true), AppValidationError);

  // Fecha ISO válida e inválida
  assert.equal(validateISODate('2026-11-24', 'Fecha'), '2026-11-24');
  assert.throws(() => validateISODate('24/11/2026', 'Fecha'), AppValidationError);

  // Fondo inicial de caja
  assert.equal(validateCajaFondoInicial(500), 500);
  assert.throws(() => validateCajaFondoInicial(-10), AppValidationError);
});

test('safeExecute captura fallos en tiempo real y registra automáticamente sin detener la app', async () => {
  clearErrorLogs();

  const okRes = await safeExecute('testOk', () => 42);
  assert.equal(okRes.ok, true);
  if (okRes.ok) assert.equal(okRes.data, 42);

  let notifiedMsg = '';
  const failRes = await safeExecute(
    'registrarAbonoCredito',
    async () => {
      throw new AppValidationError('El abono excede el saldo pendiente.', {
        field: 'monto',
      });
    },
    {
      context: { creditoId: 'cr-1', password: 'secret-value' },
      onError: (msg) => {
        notifiedMsg = msg;
      },
    }
  );

  assert.equal(failRes.ok, false);
  assert.equal(notifiedMsg, 'El abono excede el saldo pendiente.');

  const logs = getErrorLogs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'registrarAbonoCredito');
  assert.equal(logs[0].source, 'validacion');
  assert.equal(logs[0].severity, 'warning');
  // Los datos sensibles se redactan automáticamente
  assert.equal(logs[0].context?.password, '[REDACTADO]');

  const jsonExport = exportErrorLogsJSON();
  assert.match(jsonExport, /Mueblería Alquia/);
  assert.match(jsonExport, /registrarAbonoCredito/);
});

test('formatFriendlyErrorMessage traduce errores estructurados de Firestore y red', () => {
  const permJson = JSON.stringify({
    error: 'Missing or insufficient permissions.',
    operationType: 'delete',
    path: 'abonos/ab-1',
  });
  const friendlyPerm = formatFriendlyErrorMessage(new Error(permJson));
  assert.match(friendlyPerm, /Permiso denegado/);
  assert.match(friendlyPerm, /abonos\/ab-1/);

  const friendlyNet = formatFriendlyErrorMessage(new Error('Failed to fetch'));
  assert.match(friendlyNet, /Error de conexión de red/);

  clearErrorLogs();
  logAppError({
    source: 'operacion',
    action: 'testLog',
    error: new Error('Fallo simulado'),
  });
  assert.equal(getErrorLogs().length, 1);
  clearErrorLogs();
  assert.equal(getErrorLogs().length, 0);
});
