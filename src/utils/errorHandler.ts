import type { MetodoPago } from '../types/pos';

export type ErrorLogSource =
  | 'firestore'
  | 'validacion'
  | 'operacion'
  | 'ui_render'
  | 'global_runtime';

export type ErrorLogSeverity = 'warning' | 'error' | 'critical';

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  source: ErrorLogSource;
  action: string;
  severity: ErrorLogSeverity;
  code: string;
  message: string;
  userMessage: string;
  context?: Record<string, unknown>;
  stack?: string;
}

export class AppValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { code?: string; field?: string; context?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'AppValidationError';
    this.code = options?.code || 'VALIDATION_ERROR';
    this.field = options?.field;
    this.context = options?.context;
  }
}

const STORAGE_KEY = 'alquia_error_log_v1';
const MAX_ERROR_LOGS = 100;
const SENSITIVE_KEY_PATTERN = /pass|pwd|secret|token|key|auth|credential/i;

let memoryLogs: ErrorLogEntry[] | null = null;
const listeners = new Set<(logs: ErrorLogEntry[]) => void>();
let globalHandlersInstalled = false;

function sanitizeContext(ctx?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      clean[key] = '[REDACTADO]';
      continue;
    }
    if (value === undefined) continue;
    if (typeof value === 'string') {
      clean[key] = value.slice(0, 300);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      clean[key] = value;
    } else {
      try {
        clean[key] = JSON.stringify(value).slice(0, 300);
      } catch {
        clean[key] = '[Objeto no serializable]';
      }
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function readStoredLogs(): ErrorLogEntry[] {
  if (memoryLogs !== null) return memoryLogs;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryLogs = parsed.slice(0, MAX_ERROR_LOGS) as ErrorLogEntry[];
          return memoryLogs;
        }
      }
    }
  } catch {
    // Storage unavailable or corrupted — fallback safely to in-memory buffer
  }
  memoryLogs = [];
  return memoryLogs;
}

function persistLogs(logs: ErrorLogEntry[]): void {
  memoryLogs = logs.slice(0, MAX_ERROR_LOGS);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryLogs));
    }
  } catch {
    // Ignore quota or storage errors so error logging never throws
  }
  listeners.forEach((cb) => {
    try {
      cb(memoryLogs || []);
    } catch {
      // Never allow subscriber error to propagate
    }
  });
}

/**
 * Convierte errores técnicos (Firestore JSON, códigos Firebase, validaciones o excepciones JS)
 * en un mensaje claro en español para el usuario.
 */
export function formatFriendlyErrorMessage(err: unknown): string {
  if (err instanceof AppValidationError) {
    return err.message;
  }

  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '');

  // Intentar interpretar JSON estructurado de handleFirestoreError
  if (raw.startsWith('{') && raw.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      const inner = String(parsed.error || '');
      if (/permission-denied|insufficient permissions/i.test(inner)) {
        return `Permiso denegado al realizar "${parsed.operationType || 'operación'}" en ${parsed.path || 'la base de datos'}. Verifica tu cargo de Administrador o tu sesión.`;
      }
      if (/offline|unavailable|network/i.test(inner)) {
        return 'Sin conexión temporal con la base de datos. Verifica tu internet e intenta nuevamente.';
      }
      if (/quota/i.test(inner)) {
        return 'Se alcanzó el límite diario de cuota en Firestore. Intenta nuevamente más tarde.';
      }
      return inner || 'Ocurrió un error al comunicarse con la base de datos.';
    } catch {
      // Continue with fallback matching
    }
  }

  if (/permission-denied|Missing or insufficient permissions/i.test(raw)) {
    return 'No tienes permisos suficientes para completar esta operación.';
  }
  if (/client is offline|network-request-failed|Failed to fetch|unavailable/i.test(raw)) {
    return 'Error de conexión de red. Verifica tu acceso a internet e intenta de nuevo.';
  }
  if (/invalid-credential|wrong-password/i.test(raw)) {
    return 'Correo o contraseña incorrectos.';
  }
  if (/too-many-requests/i.test(raw)) {
    return 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.';
  }

  return raw.trim() || 'Ocurrió un error inesperado. La aplicación continúa operando con normalidad.';
}

/**
 * Registra automáticamente un error en el historial persistente y en consola estructurada.
 */
export function logAppError(params: {
  source: ErrorLogSource;
  action: string;
  error: unknown;
  severity?: ErrorLogSeverity;
  code?: string;
  userMessage?: string;
  context?: Record<string, unknown>;
}): ErrorLogEntry {
  const errObj = params.error instanceof Error ? params.error : null;
  const isValidation = params.error instanceof AppValidationError;
  const severity: ErrorLogSeverity =
    params.severity || (isValidation ? 'warning' : 'error');
  const rawMessage = errObj ? errObj.message : String(params.error ?? 'Error desconocido');
  const userMessage = params.userMessage || formatFriendlyErrorMessage(params.error);
  const code =
    params.code ||
    (params.error instanceof AppValidationError
      ? params.error.code
      : (params.error as { code?: string } | null)?.code || `${params.source.toUpperCase()}_ERROR`);

  const entry: ErrorLogEntry = {
    id: `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    source: params.source,
    action: params.action,
    severity,
    code: String(code),
    message: rawMessage.slice(0, 600),
    userMessage: userMessage.slice(0, 300),
    context: sanitizeContext(
      params.error instanceof AppValidationError
        ? { ...params.error.context, ...params.context, field: params.error.field }
        : params.context
    ),
    stack: errObj?.stack ? errObj.stack.split('\n').slice(0, 6).join('\n') : undefined,
  };

  const current = readStoredLogs();
  persistLogs([entry, ...current]);

  if (severity === 'warning') {
    console.warn(`[Alquia][${entry.source}][${entry.action}] ${entry.message}`, entry.context || '');
  } else {
    console.error(
      `[Alquia][${entry.source}][${entry.action}] (${entry.id}) ${entry.message}`,
      entry.context || ''
    );
  }

  return entry;
}

export function getErrorLogs(): ErrorLogEntry[] {
  return [...readStoredLogs()];
}

export function clearErrorLogs(): void {
  persistLogs([]);
}

export function subscribeErrorLogs(listener: (logs: ErrorLogEntry[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function exportErrorLogsJSON(): string {
  return JSON.stringify(
    {
      sistema: 'Mueblería Alquia',
      exportadoEn: new Date().toISOString(),
      totalErrores: readStoredLogs().length,
      registros: readStoredLogs(),
    },
    null,
    2
  );
}

/**
 * Envuelve cualquier operación síncrona o asíncrona en un bloque try-catch seguro
 * con registro automático de errores para evitar que la aplicación se detenga.
 */
export async function safeExecute<T>(
  action: string,
  fn: () => Promise<T> | T,
  options?: {
    source?: ErrorLogSource;
    context?: Record<string, unknown>;
    onError?: (userMessage: string, entry: ErrorLogEntry) => void;
    rethrow?: boolean;
  }
): Promise<{ ok: true; data: T } | { ok: false; error: ErrorLogEntry; userMessage: string }> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const entry = logAppError({
      source: options?.source || (err instanceof AppValidationError ? 'validacion' : 'operacion'),
      action,
      error: err,
      context: options?.context,
    });
    if (options?.onError) {
      try {
        options.onError(entry.userMessage, entry);
      } catch {
        // Ignore callback error
      }
    }
    if (options?.rethrow) {
      throw err;
    }
    return { ok: false, error: entry, userMessage: entry.userMessage };
  }
}

/**
 * Instala capturadores globales para errores de ejecución y promesas rechazadas
 * no capturadas, evitando caídas silenciosas y registrando el origen exacto.
 */
export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') return;
  globalHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    // Ignorar ruido inofensivo del entorno (ResizeObserver / HMR WebSocket)
    if (/ResizeObserver|WebSocket/i.test(msg)) return;
    logAppError({
      source: 'global_runtime',
      action: 'window.error',
      severity: 'critical',
      error: event.error || new Error(msg || 'Error de ejecución no capturado'),
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason || '');
    if (/WebSocket/i.test(msg)) return;
    logAppError({
      source: 'global_runtime',
      action: 'window.unhandledrejection',
      severity: 'error',
      error: reason instanceof Error ? reason : new Error(msg || 'Promesa rechazada sin capturar'),
    });
  });
}

// =========================================================================
// Validaciones estrictas de datos para prevenir inconsistencias
// =========================================================================

const VALID_METODOS_PAGO = new Set<MetodoPago>(['efectivo', 'tarjeta', 'transferencia']);

export function validateRequiredText(
  value: unknown,
  fieldLabel: string,
  minLen: number = 1,
  maxLen: number = 160
): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean.length < minLen) {
    throw new AppValidationError(`El campo "${fieldLabel}" es obligatorio.`, {
      code: 'REQUIRED_TEXT',
      field: fieldLabel,
    });
  }
  if (clean.length > maxLen) {
    throw new AppValidationError(
      `El campo "${fieldLabel}" no puede exceder ${maxLen} caracteres.`,
      { code: 'MAX_LENGTH', field: fieldLabel, context: { length: clean.length, maxLen } }
    );
  }
  return clean;
}

export function validatePositiveAmount(
  value: unknown,
  fieldLabel: string,
  max?: number
): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new AppValidationError(
      `El campo "${fieldLabel}" debe ser un monto válido mayor a $0.00.`,
      { code: 'INVALID_POSITIVE_AMOUNT', field: fieldLabel, context: { value } }
    );
  }
  const rounded = Math.round(num * 100) / 100;
  if (typeof max === 'number' && rounded > Math.round(max * 100) / 100 + 0.001) {
    throw new AppValidationError(
      `El campo "${fieldLabel}" no puede superar el máximo permitido ($${max.toFixed(2)}).`,
      { code: 'EXCEEDS_MAX_AMOUNT', field: fieldLabel, context: { value: rounded, max } }
    );
  }
  return rounded;
}

export function validateNonNegativeAmount(
  value: unknown,
  fieldLabel: string,
  max?: number
): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new AppValidationError(
      `El campo "${fieldLabel}" debe ser un número válido mayor o igual a 0.`,
      { code: 'INVALID_NON_NEGATIVE', field: fieldLabel, context: { value } }
    );
  }
  const rounded = Math.round(num * 100) / 100;
  if (typeof max === 'number' && rounded > Math.round(max * 100) / 100 + 0.001) {
    throw new AppValidationError(
      `El campo "${fieldLabel}" no puede superar $${max.toFixed(2)}.`,
      { code: 'EXCEEDS_MAX_AMOUNT', field: fieldLabel, context: { value: rounded, max } }
    );
  }
  return rounded;
}

export function validateISODate(dateStr: unknown, fieldLabel: string): string {
  const clean = typeof dateStr === 'string' ? dateStr.trim().slice(0, 10) : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) {
    throw new AppValidationError(
      `La fecha "${fieldLabel}" debe tener formato válido AAAA-MM-DD.`,
      { code: 'INVALID_DATE_FORMAT', field: fieldLabel, context: { value: dateStr } }
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new AppValidationError(`La fecha "${fieldLabel}" no existe en el calendario.`, {
      code: 'INVALID_CALENDAR_DATE',
      field: fieldLabel,
      context: { value: clean },
    });
  }
  return clean;
}

export function validatePhoneWhatsApp(phone: unknown, required: boolean = false): string {
  const raw = typeof phone === 'string' ? phone.trim() : '';
  if (!raw) {
    if (required) {
      throw new AppValidationError('El número de WhatsApp es obligatorio.', {
        code: 'REQUIRED_PHONE',
        field: 'telefono',
      });
    }
    return '';
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new AppValidationError(
      'El número de WhatsApp / teléfono debe tener entre 10 y 15 dígitos.',
      { code: 'INVALID_PHONE', field: 'telefono', context: { digitsCount: digits.length } }
    );
  }
  return raw;
}

export function validateMetodoPago(metodo: unknown): MetodoPago {
  if (typeof metodo !== 'string' || !VALID_METODOS_PAGO.has(metodo as MetodoPago)) {
    throw new AppValidationError('Método de pago inválido. Usa efectivo, tarjeta o transferencia.', {
      code: 'INVALID_PAYMENT_METHOD',
      field: 'metodoPago',
      context: { metodo },
    });
  }
  return metodo as MetodoPago;
}

export function validateProductoInput(input: {
  sku: string;
  nombre: string;
  precioContado: number;
  precioCredito: number;
  costoUnitario: number;
  stockDisponible: number;
  stockMinimo: number;
}): void {
  validateRequiredText(input.sku, 'SKU', 2, 40);
  validateRequiredText(input.nombre, 'Nombre del producto', 2, 140);
  validatePositiveAmount(input.precioContado, 'Precio de contado');
  validatePositiveAmount(input.precioCredito, 'Precio a crédito');
  validateNonNegativeAmount(input.costoUnitario, 'Costo unitario');

  if (!Number.isInteger(input.stockDisponible) || input.stockDisponible < 0) {
    throw new AppValidationError(
      'Las existencias disponibles deben ser un número entero mayor o igual a 0.',
      { code: 'INVALID_STOCK', field: 'stockDisponible', context: { value: input.stockDisponible } }
    );
  }
  if (!Number.isInteger(input.stockMinimo) || input.stockMinimo < 0) {
    throw new AppValidationError(
      'El stock mínimo debe ser un número entero mayor o igual a 0.',
      { code: 'INVALID_MIN_STOCK', field: 'stockMinimo', context: { value: input.stockMinimo } }
    );
  }
}

export function validateCreditoInput(input: {
  clienteId: string;
  descripcion: string;
  montoTotal: number;
  enganche: number;
  metodoPago: MetodoPago;
  numPagos: number;
  primeraFechaPago?: string;
}): void {
  validateRequiredText(input.clienteId, 'Cliente', 1, 100);
  validateRequiredText(input.descripcion, 'Descripción de muebles', 2, 240);
  const total = validatePositiveAmount(input.montoTotal, 'Monto total del crédito');
  const enganche = validateNonNegativeAmount(input.enganche, 'Enganche inicial', total);
  if (enganche >= total) {
    throw new AppValidationError(
      'El enganche debe ser menor al monto total para abrir un crédito (para pago total usa venta de contado).',
      { code: 'ENGANCHE_EXCEEDS_TOTAL', field: 'enganche', context: { enganche, total } }
    );
  }
  validateMetodoPago(input.metodoPago);
  if (!Number.isInteger(input.numPagos) || input.numPagos < 1 || input.numPagos > 120) {
    throw new AppValidationError('El número de pagos debe ser un entero entre 1 y 120.', {
      code: 'INVALID_NUM_PAGOS',
      field: 'numPagos',
      context: { numPagos: input.numPagos },
    });
  }
  if (input.primeraFechaPago && input.primeraFechaPago.trim()) {
    validateISODate(input.primeraFechaPago, 'Fecha de primer pago');
  }
}

export function validateApartadoInput(input: {
  clienteId: string;
  descripcion: string;
  montoTotal: number;
  anticipoInicial: number;
  metodoPago: MetodoPago;
  fechaLimite: string;
  proximoPagoFecha?: string;
}): void {
  validateRequiredText(input.clienteId, 'Cliente', 1, 100);
  validateRequiredText(input.descripcion, 'Descripción del apartado', 2, 240);
  const total = validatePositiveAmount(input.montoTotal, 'Monto total del apartado');
  const anticipo = validateNonNegativeAmount(input.anticipoInicial, 'Anticipo inicial', total);
  if (anticipo >= total) {
    throw new AppValidationError(
      'El anticipo debe ser menor al monto total del apartado.',
      { code: 'ANTICIPO_EXCEEDS_TOTAL', field: 'anticipoInicial', context: { anticipo, total } }
    );
  }
  validateMetodoPago(input.metodoPago);
  validateISODate(input.fechaLimite, 'Fecha límite del apartado');
  if (input.proximoPagoFecha && input.proximoPagoFecha.trim()) {
    validateISODate(input.proximoPagoFecha, 'Fecha de próximo pago');
  }
}

export function validateAbonoInput(input: {
  monto: number;
  saldoPendiente: number;
  metodoPago: MetodoPago;
}): number {
  const saldo = validatePositiveAmount(input.saldoPendiente, 'Saldo pendiente');
  const monto = validatePositiveAmount(input.monto, 'Monto del abono', saldo);
  validateMetodoPago(input.metodoPago);
  return monto;
}

export function validateCajaFondoInicial(fondo: number): number {
  return validateNonNegativeAmount(fondo, 'Fondo inicial de caja', 500000);
}
