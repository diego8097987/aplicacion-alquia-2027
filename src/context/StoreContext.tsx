import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Transaction,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
  type ConnectionCheckResult,
} from '../firebase/config';
import {
  formatFriendlyErrorMessage,
  logAppError,
  validateApartadoInput,
  validateCajaFondoInicial,
  validateCreditoInput,
  validateMetodoPago,
  validatePhoneWhatsApp,
  validatePositiveAmount,
  validateProductoInput,
  validateRequiredText,
} from '../utils/errorHandler';
import type {
  Abono,
  AlertaVencimiento,
  Apartado,
  AppUser,
  CajaTurno,
  Cliente,
  CompraProveedor,
  CompraProveedorItem,
  ConfiguracionTienda,
  Credito,
  FrecuenciaPago,
  InventarioSucursal,
  MetodoPago,
  MovimientoInventario,
  Producto,
  Proveedor,
  ResolucionCancelacion,
  Sucursal,
  TicketData,
  TipoVenta,
  UserRole,
  Venta,
  VentaItem,
} from '../types/pos';
import {
  addDaysToISODate,
  applyAdminOverdueIncrease,
  applyPaymentToCredit,
  applyPaymentToLayaway,
  calculateCartTotals,
  calculateCreditPlan,
  filterProductosForSucursal,
  formatMXN,
  getProductStoreAvailability,
  resolveLayawayCancellation,
  roundMXN,
  summarizeCajaShift,
  todayISODate,
} from '../utils/finance';
import {
  DEFAULT_ALERT_BODY_TEMPLATE,
  DEFAULT_ALERT_SUBJECT_TEMPLATE,
  dispatchAlertEmailViaEmailJS,
  evaluateDueAlerts,
} from '../utils/alertsMonitor';

const LEGACY_DEMO_STORAGE_KEY = 'alquia_pos_demo_dataset_v1';
const THEME_STORAGE_KEY = 'alquia_pos_theme_v1';
const TIENDA_ID = 'alquia-apaseo';
export const PRIMARY_ADMIN_EMAIL = 'muebleriaalquia@gmail.com';
const BOOTSTRAP_ADMIN_EMAILS = ['muebleriaalquia@gmail.com'];

export interface StaffMember {
  uid: string;
  nombre: string;
  correo: string;
  rol: UserRole;
  sucursalId?: string;
  activo: boolean;
  creadoEn: string;
}

interface StoreDataset {
  configuracion: ConfiguracionTienda;
  usuarios: StaffMember[];
  sucursales: Sucursal[];
  inventarioSucursales: InventarioSucursal[];
  cajasTurnos: CajaTurno[];
  clientes: Cliente[];
  proveedores: Proveedor[];
  productos: Producto[];
  ventas: Venta[];
  creditos: Credito[];
  apartados: Apartado[];
  abonos: Abono[];
  alertas: AlertaVencimiento[];
  movimientos: MovimientoInventario[];
  compras: CompraProveedor[];
}

const DEFAULT_CONFIG: ConfiguracionTienda = {
  nombreComercial: 'Mueblería Alquia',
  ubicacion: 'Apaseo el Alto, Guanajuato, México',
  telefono: '(413) 166-0420',
  mensajeTicket: 'Conserve este ticket para garantías y aclaraciones.',
  correoAlertas: PRIMARY_ADMIN_EMAIL,
  diasAnticipacionAlerta: 3,
  alertasAutomaticasActivas: true,
  plantillaAsuntoAlerta: DEFAULT_ALERT_SUBJECT_TEMPLATE,
  plantillaCuerpoAlerta: DEFAULT_ALERT_BODY_TEMPLATE,
  emailjsServiceId: '',
  emailjsTemplateId: '',
  emailjsPublicKey: '',
  consecutivoVenta: 0,
  consecutivoCredito: 0,
  consecutivoApartado: 0,
  consecutivoAbono: 0,
  consecutivoCompra: 0,
};

function createEmptyDataset(): StoreDataset {
  return {
    configuracion: { ...DEFAULT_CONFIG },
    usuarios: [],
    sucursales: [],
    inventarioSucursales: [],
    cajasTurnos: [],
    clientes: [],
    proveedores: [],
    productos: [],
    ventas: [],
    creditos: [],
    apartados: [],
    abonos: [],
    alertas: [],
    movimientos: [],
    compras: [],
  };
}

function createAutostartDataset(): StoreDataset {
  const now = new Date().toISOString();
  const yesterday = addDaysToISODate(todayISODate(), -2);
  const sucursales: Sucursal[] = [
    {
      id: 'suc-tienda-1',
      nombre: 'Tienda 1 — Centro',
      direccion: 'Av. Juárez #114, Zona Centro, Apaseo el Alto, Gto.',
      telefono: '(413) 166-0420',
      encargadoUid: 'local-admin',
      encargadoNombre: 'Diego Olivares',
      propietarioUid: 'local-admin',
      activa: true,
      creadoEn: now,
    },
    {
      id: 'suc-tienda-2',
      nombre: 'Tienda 2 — Norte',
      direccion: 'Blvd. Constituyentes #48, Col. El Rejalgar, Apaseo el Alto, Gto.',
      telefono: '(413) 166-0988',
      encargadoUid: 'local-cobrador',
      encargadoNombre: 'Laura Cobrador',
      propietarioUid: 'local-cobrador',
      activa: true,
      creadoEn: now,
    },
  ];

  const usuarios: StaffMember[] = [
    {
      uid: 'local-admin',
      nombre: 'Administrador Alquia',
      correo: PRIMARY_ADMIN_EMAIL,
      rol: 'admin',
      sucursalId: 'suc-tienda-1',
      activo: true,
      creadoEn: now,
    },
    {
      uid: 'local-cobrador',
      nombre: 'Laura Cobrador',
      correo: 'cobrador@muebleriaalquia.mx',
      rol: 'cobrador',
      sucursalId: 'suc-tienda-2',
      activo: true,
      creadoEn: now,
    },
  ];

  const productos: Producto[] = [
    {
      id: 'prod-sala-roma',
      sku: 'SALA-ROMA-01',
      nombre: 'Sala Esquinera Roma 3 Piezas',
      categoria: 'Salas',
      marca: 'Alquia Select',
      precioContado: 12500,
      precioCredito: 14800,
      costoUnitario: 8200,
      stockDisponible: 90,
      stockReservado: 0,
      stockMinimo: 5,
      proveedorId: '',
      creadoPorUid: 'local-admin',
      creadoPorSucursalId: 'suc-tienda-1',
      activo: true,
      creadoEn: now,
    },
    {
      id: 'prod-comedor-cedro',
      sku: 'COM-CEDRO-06',
      nombre: 'Comedor Cedro 6 Sillas',
      categoria: 'Comedores',
      marca: 'Maderas Finas',
      precioContado: 8900,
      precioCredito: 10200,
      costoUnitario: 5800,
      stockDisponible: 12,
      stockReservado: 0,
      stockMinimo: 3,
      proveedorId: '',
      creadoPorUid: 'local-cobrador',
      creadoPorSucursalId: 'suc-tienda-2',
      activo: true,
      creadoEn: now,
    },
  ];

  const inventarioSucursales: InventarioSucursal[] = [
    {
      id: 'suc-tienda-1__prod-sala-roma',
      sucursalId: 'suc-tienda-1',
      sucursalNombre: 'Tienda 1 — Centro',
      productoId: 'prod-sala-roma',
      propietarioUid: 'local-admin',
      stockDisponible: 90,
      stockReservado: 0,
      stockMinimo: 5,
      actualizadoEn: now,
    },
    {
      id: 'suc-tienda-2__prod-comedor-cedro',
      sucursalId: 'suc-tienda-2',
      sucursalNombre: 'Tienda 2 — Norte',
      productoId: 'prod-comedor-cedro',
      propietarioUid: 'local-cobrador',
      stockDisponible: 12,
      stockReservado: 0,
      stockMinimo: 3,
      actualizadoEn: now,
    },
  ];

  const clientes: Cliente[] = [
    {
      id: 'cli-demo-1',
      nombre: 'Carlos Mendoza',
      telefono: '4131234567',
      direccion: 'Calle Hidalgo #22, Apaseo el Alto',
      referencias: 'Frente a la plaza',
      saldoAFavor: 0,
      activo: true,
      creadoPorUid: 'local-admin',
      creadoEn: now,
    },
  ];

  const creditos: Credito[] = [
    {
      id: 'cr-demo-1',
      folio: 'CR-0001',
      ventaId: 'v-demo-prev',
      clienteId: 'cli-demo-1',
      clienteNombre: 'Carlos Mendoza',
      clienteTelefono: '4131234567',
      sucursalId: 'suc-tienda-1',
      itemsResumen: '1x Sala Esquinera Roma 3 Piezas',
      montoTotal: 14800,
      enganche: 2800,
      totalAbonado: 2800,
      saldoPendiente: 12000,
      frecuencia: 'semanal',
      numPagos: 12,
      montoPago: 1000,
      pagosRealizados: 0,
      proximaFechaPago: yesterday,
      recargosAcumulados: 0,
      estado: 'activo',
      vendedorUid: 'local-admin',
      creadoEn: now,
    },
  ];

  const cajasTurnos: CajaTurno[] = [
    {
      id: 'caja-demo-admin-closed',
      sucursalId: 'suc-tienda-1',
      sucursalNombre: 'Tienda 1 — Centro',
      sucursalDireccion: 'Av. Juárez #114, Zona Centro, Apaseo el Alto, Gto.',
      encargadoTienda: 'Diego Olivares',
      abiertaPorUid: 'local-admin',
      abiertaPorNombre: 'Administrador Alquia',
      fondoInicial: 500,
      estado: 'cerrada',
      abiertaEn: `${yesterday}T09:00:00.000Z`,
      cerradaEn: `${yesterday}T19:00:00.000Z`,
      cerradaPorUid: 'local-admin',
      cerradaPorNombre: 'Administrador Alquia',
      totalVentasDia: 12500,
      totalAbonosDia: 1500,
      totalEfectivo: 14000,
      totalTarjeta: 0,
      totalTransferencia: 0,
      cantidadVentasBorradas: 1,
      notasCierre: 'Corte de turno Tienda 1',
    },
    {
      id: 'caja-demo-cobrador-closed',
      sucursalId: 'suc-tienda-2',
      sucursalNombre: 'Tienda 2 — Norte',
      sucursalDireccion: 'Blvd. Constituyentes #48, Col. El Rejalgar, Apaseo el Alto, Gto.',
      encargadoTienda: 'Laura Cobrador',
      abiertaPorUid: 'local-cobrador',
      abiertaPorNombre: 'Laura Cobrador',
      fondoInicial: 400,
      estado: 'cerrada',
      abiertaEn: `${yesterday}T10:00:00.000Z`,
      cerradaEn: `${yesterday}T18:30:00.000Z`,
      cerradaPorUid: 'local-cobrador',
      cerradaPorNombre: 'Laura Cobrador',
      totalVentasDia: 8900,
      totalAbonosDia: 2000,
      totalEfectivo: 10900,
      totalTarjeta: 0,
      totalTransferencia: 0,
      cantidadVentasBorradas: 1,
      notasCierre: 'Corte de turno Tienda 2',
    },
  ];

  return {
    ...createEmptyDataset(),
    configuracion: {
      ...DEFAULT_CONFIG,
      consecutivoVenta: 1,
      consecutivoCredito: 1,
    },
    usuarios,
    sucursales,
    inventarioSucursales,
    cajasTurnos,
    clientes,
    productos,
    creditos,
  };
}

export interface AbonoConfirmResult {
  ticket: TicketData;
  liquidado: boolean;
  suggestedNextDate: string;
  overdueAlert?: AlertaVencimiento;
}

interface CheckoutPayload {
  tipo: TipoVenta;
  clienteId: string;
  cart: Array<{ producto: Producto; cantidad: number }>;
  descuento: number;
  aplicarSaldoAFavor: boolean;
  metodoPago: MetodoPago;
  pagoInicial: number;
  efectivoRecibido?: number;
  frecuencia?: FrecuenciaPago;
  numPagos?: number;
  fechaLimite?: string;
  condiciones?: string;
}

interface StoreContextValue {
  user: AppUser | null;
  authReady: boolean;
  loadingData: boolean;
  connectionStatus: ConnectionCheckResult | null;
  recheckConnection: () => Promise<ConnectionCheckResult>;
  darkMode: boolean;
  toggleDarkMode: () => void;
  activeTicket: TicketData | null;
  setActiveTicket: (ticket: TicketData | null) => void;
  toast: { type: 'success' | 'error'; message: string } | null;
  notify: (message: string, type?: 'success' | 'error') => void;

  // Multi-store & Caja context
  activeSucursalId: string;
  setActiveSucursalId: (sucursalId: string) => void;
  currentSucursal: Sucursal | null;
  activeCajaTurno: CajaTurno | null;

  // Auth actions
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (nombre: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshAuthUser: () => Promise<void>;
  logout: () => Promise<void>;

  // Collections & Config
  configuracion: ConfiguracionTienda;
  usuarios: StaffMember[];
  sucursales: Sucursal[];
  inventarioSucursales: InventarioSucursal[];
  cajasTurnos: CajaTurno[];
  clientes: Cliente[];
  proveedores: Proveedor[];
  productos: Producto[];
  ventas: Venta[];
  creditos: Credito[];
  apartados: Apartado[];
  abonos: Abono[];
  alertas: AlertaVencimiento[];
  movimientos: MovimientoInventario[];
  compras: CompraProveedor[];

  // Domain mutations
  saveConfiguracion: (
    input: Partial<
      Pick<
        ConfiguracionTienda,
        | 'nombreComercial'
        | 'ubicacion'
        | 'telefono'
        | 'mensajeTicket'
        | 'correoAlertas'
        | 'diasAnticipacionAlerta'
        | 'alertasAutomaticasActivas'
        | 'plantillaAsuntoAlerta'
        | 'plantillaCuerpoAlerta'
        | 'emailjsServiceId'
        | 'emailjsTemplateId'
        | 'emailjsPublicKey'
      >
    >
  ) => Promise<void>;
  saveUsuarioStaff: (input: {
    uid: string;
    nombre: string;
    correo: string;
    rol: UserRole;
    sucursalId?: string;
    activo: boolean;
  }) => Promise<void>;
  saveSucursal: (input: {
    id?: string;
    nombre: string;
    direccion: string;
    telefono?: string;
    encargadoUid?: string;
    encargadoNombre?: string;
    propietarioUid?: string;
    activa?: boolean;
  }) => Promise<void>;
  updateOwnSucursalAddress: (input: { direccion: string; telefono?: string }) => Promise<void>;
  abrirCaja: (fondoInicial: number) => Promise<CajaTurno>;
  cerrarCaja: (input?: { notasCierre?: string }) => Promise<{ ventasBorradas: number }>;
  deleteCajaTurno: (turnoId: string) => Promise<void>;
  runAutoDueAlertsCheck: (silent?: boolean) => Promise<{ created: number; emailed: number }>;
  addCliente: (
    input: Omit<Cliente, 'id' | 'saldoAFavor' | 'activo' | 'creadoPorUid' | 'creadoEn'>
  ) => Promise<Cliente>;
  updateCliente: (
    clienteId: string,
    input: Pick<Cliente, 'nombre' | 'telefono' | 'direccion' | 'referencias'>
  ) => Promise<void>;
  deleteCliente: (clienteId: string) => Promise<void>;
  clearAllClientes: () => Promise<{ deleted: number; skippedActive: number }>;
  saveProducto: (
    input: Omit<Producto, 'id' | 'creadoEn' | 'stockReservado'>,
    existingId?: string
  ) => Promise<void>;
  deleteProducto: (productoId: string) => Promise<void>;
  toggleProductoActivo: (productoId: string) => Promise<void>;
  saveProveedor: (
    input: Omit<Proveedor, 'id' | 'creadoEn'>,
    existingId?: string
  ) => Promise<void>;
  deleteProveedor: (proveedorId: string) => Promise<void>;
  registrarCompraProveedor: (input: {
    proveedorId: string;
    items: CompraProveedorItem[];
    notas: string;
  }) => Promise<void>;
  registrarAjusteInventario: (input: {
    productoId: string;
    delta: number;
    motivo: string;
    sucursalId?: string;
  }) => Promise<void>;
  deleteMovimientoInventario: (movimientoId: string) => Promise<void>;
  procesarVentaPOS: (payload: CheckoutPayload) => Promise<TicketData>;
  crearCreditoDirecto: (input: {
    clienteId: string;
    productoId?: string;
    cantidad?: number;
    descripcion: string;
    montoTotal: number;
    enganche: number;
    metodoPago: MetodoPago;
    frecuencia: FrecuenciaPago;
    numPagos: number;
    primeraFechaPago?: string;
  }) => Promise<TicketData>;
  deleteCredito: (creditoId: string) => Promise<void>;
  crearApartadoDirecto: (input: {
    clienteId: string;
    productoId?: string;
    cantidad?: number;
    descripcion: string;
    montoTotal: number;
    anticipoInicial: number;
    metodoPago: MetodoPago;
    fechaLimite: string;
    proximoPagoFecha?: string;
    condiciones: string;
  }) => Promise<TicketData>;
  deleteApartado: (apartadoId: string) => Promise<void>;
  registrarAbonoCredito: (input: {
    creditoId: string;
    monto: number;
    metodoPago: MetodoPago;
    notas: string;
    deferTicket?: boolean;
  }) => Promise<AbonoConfirmResult>;
  registrarAbonoApartado: (input: {
    apartadoId: string;
    monto: number;
    metodoPago: MetodoPago;
    notas: string;
    deferTicket?: boolean;
  }) => Promise<AbonoConfirmResult>;
  deleteAbono: (abonoId: string) => Promise<void>;
  clearAbonosYCobranzaDelDia: (
    scope?: 'hoy' | 'todos'
  ) => Promise<{ abonosBorrados: number; ventasBorradas: number }>;
  actualizarProximaFechaPago: (input: {
    tipo: 'credito' | 'apartado';
    operacionId: string;
    nuevaFecha: string;
    actualizarFechaLimite?: boolean;
  }) => Promise<void>;
  aumentarPagoUsuarioAtrasado: (input: {
    tipo: 'credito' | 'apartado';
    operacionId: string;
    incrementoSaldo: number;
    nuevoMontoPago?: number;
    motivo: string;
  }) => Promise<void>;
  registrarAlertaEnviada: (input: {
    alertaId?: string;
    operacionTipo: 'credito' | 'apartado';
    operacionId: string;
    operacionFolio: string;
    clienteId: string;
    clienteNombre: string;
    clienteTelefono: string;
    montoAPagar: number;
    fechaLimite: string;
    diasAtraso: number;
    correoDestino: string;
  }) => Promise<void>;
  cancelarApartado: (input: {
    apartadoId: string;
    resolucion: Exclude<ResolucionCancelacion, 'ninguna'>;
    montoPenalizacion: number;
    motivo: string;
  }) => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeInvDocId(sucursalId: string, productoId: string): string {
  return `${sucursalId}__${productoId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function padFolio(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

function normalizeRole(rawRole: unknown): UserRole {
  return rawRole === 'admin' ? 'admin' : 'cobrador';
}

function isBootstrapEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return BOOTSTRAP_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function toISOStringSafe(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function sortByCreatedDesc<T extends { creadoEn: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0
  );
}

function parseConfigData(raw: Record<string, unknown> | undefined): ConfiguracionTienda {
  if (!raw) return { ...DEFAULT_CONFIG };
  return {
    nombreComercial:
      typeof raw.nombreComercial === 'string' && raw.nombreComercial.trim()
        ? raw.nombreComercial
        : DEFAULT_CONFIG.nombreComercial,
    ubicacion: typeof raw.ubicacion === 'string' ? raw.ubicacion : DEFAULT_CONFIG.ubicacion,
    telefono: typeof raw.telefono === 'string' ? raw.telefono : DEFAULT_CONFIG.telefono,
    mensajeTicket:
      typeof raw.mensajeTicket === 'string' ? raw.mensajeTicket : DEFAULT_CONFIG.mensajeTicket,
    correoAlertas:
      typeof raw.correoAlertas === 'string' && raw.correoAlertas.trim()
        ? raw.correoAlertas
        : DEFAULT_CONFIG.correoAlertas,
    diasAnticipacionAlerta:
      typeof raw.diasAnticipacionAlerta === 'number'
        ? Math.max(0, Math.min(30, Math.floor(raw.diasAnticipacionAlerta)))
        : DEFAULT_CONFIG.diasAnticipacionAlerta,
    alertasAutomaticasActivas:
      typeof raw.alertasAutomaticasActivas === 'boolean'
        ? raw.alertasAutomaticasActivas
        : DEFAULT_CONFIG.alertasAutomaticasActivas,
    plantillaAsuntoAlerta:
      typeof raw.plantillaAsuntoAlerta === 'string' && raw.plantillaAsuntoAlerta.trim()
        ? raw.plantillaAsuntoAlerta
        : DEFAULT_CONFIG.plantillaAsuntoAlerta,
    plantillaCuerpoAlerta:
      typeof raw.plantillaCuerpoAlerta === 'string' && raw.plantillaCuerpoAlerta.trim()
        ? raw.plantillaCuerpoAlerta
        : DEFAULT_CONFIG.plantillaCuerpoAlerta,
    emailjsServiceId:
      typeof raw.emailjsServiceId === 'string' ? raw.emailjsServiceId : '',
    emailjsTemplateId:
      typeof raw.emailjsTemplateId === 'string' ? raw.emailjsTemplateId : '',
    emailjsPublicKey:
      typeof raw.emailjsPublicKey === 'string' ? raw.emailjsPublicKey : '',
    consecutivoVenta: typeof raw.consecutivoVenta === 'number' ? raw.consecutivoVenta : 0,
    consecutivoCredito: typeof raw.consecutivoCredito === 'number' ? raw.consecutivoCredito : 0,
    consecutivoApartado:
      typeof raw.consecutivoApartado === 'number' ? raw.consecutivoApartado : 0,
    consecutivoAbono: typeof raw.consecutivoAbono === 'number' ? raw.consecutivoAbono : 0,
    consecutivoCompra: typeof raw.consecutivoCompra === 'number' ? raw.consecutivoCompra : 0,
  };
}

function writeConfigInTransaction(
  tx: Transaction,
  configExists: boolean,
  nextConfig: ConfiguracionTienda,
  countersOnly: boolean = false
) {
  const ref = doc(db, 'configuracion', 'tienda');
  if (configExists && countersOnly) {
    tx.update(ref, {
      consecutivoVenta: nextConfig.consecutivoVenta,
      consecutivoCredito: nextConfig.consecutivoCredito,
      consecutivoApartado: nextConfig.consecutivoApartado,
      consecutivoAbono: nextConfig.consecutivoAbono,
      consecutivoCompra: nextConfig.consecutivoCompra,
      actualizadoEn: serverTimestamp(),
    });
    return;
  }

  const payload = {
    nombreComercial: nextConfig.nombreComercial,
    ubicacion: nextConfig.ubicacion,
    telefono: nextConfig.telefono,
    mensajeTicket: nextConfig.mensajeTicket,
    correoAlertas: nextConfig.correoAlertas || PRIMARY_ADMIN_EMAIL,
    diasAnticipacionAlerta: nextConfig.diasAnticipacionAlerta,
    alertasAutomaticasActivas: nextConfig.alertasAutomaticasActivas,
    plantillaAsuntoAlerta: nextConfig.plantillaAsuntoAlerta.slice(0, 180),
    plantillaCuerpoAlerta: nextConfig.plantillaCuerpoAlerta.slice(0, 1200),
    emailjsServiceId: (nextConfig.emailjsServiceId || '').slice(0, 80),
    emailjsTemplateId: (nextConfig.emailjsTemplateId || '').slice(0, 80),
    emailjsPublicKey: (nextConfig.emailjsPublicKey || '').slice(0, 80),
    consecutivoVenta: nextConfig.consecutivoVenta,
    consecutivoCredito: nextConfig.consecutivoCredito,
    consecutivoApartado: nextConfig.consecutivoApartado,
    consecutivoAbono: nextConfig.consecutivoAbono,
    consecutivoCompra: nextConfig.consecutivoCompra,
    tiendaId: TIENDA_ID,
    actualizadoEn: serverTimestamp(),
  };
  if (configExists) {
    tx.update(ref, payload);
  } else {
    tx.set(ref, payload);
  }
}

function writeInvSucursalInTransaction(
  tx: Transaction,
  invRef: ReturnType<typeof doc>,
  invExists: boolean,
  data: {
    sucursalId: string;
    sucursalNombre: string;
    productoId: string;
    propietarioUid: string;
    stockDisponible: number;
    stockReservado: number;
    stockMinimo: number;
  }
) {
  if (invExists) {
    tx.update(invRef, {
      sucursalNombre: data.sucursalNombre,
      stockDisponible: data.stockDisponible,
      stockReservado: data.stockReservado,
      stockMinimo: data.stockMinimo,
      actualizadoEn: serverTimestamp(),
    });
  } else {
    tx.set(invRef, {
      sucursalId: data.sucursalId,
      sucursalNombre: data.sucursalNombre,
      productoId: data.productoId,
      propietarioUid: data.propietarioUid,
      stockDisponible: data.stockDisponible,
      stockReservado: data.stockReservado,
      stockMinimo: data.stockMinimo,
      tiendaId: TIENDA_ID,
      actualizadoEn: serverTimestamp(),
    });
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionCheckResult | null>(null);
  const [dataset, setDataset] = useState<StoreDataset>(() => createEmptyDataset());
  const [activeTicket, setActiveTicket] = useState<TicketData | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeSucursalId, setActiveSucursalIdState] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const alertMonitorRunningRef = useRef(false);
  const alertMonitorLastKeyRef = useRef('');
  const cleanedRequestedShiftRef = useRef(false);
  const cleanedRequestedMovIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_DEMO_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const recheckConnection = useCallback(async () => {
    const result = await testConnection();
    setConnectionStatus(result);
    return result;
  }, []);

  useEffect(() => {
    void recheckConnection();
  }, [recheckConnection]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => setDarkMode((prev) => !prev), []);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Auth state listener (+ deterministic sandbox when ?autostart=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const roleQuery = params.get('role');
      const roleParam: UserRole =
        roleQuery === 'cobrador' || roleQuery === 'cajero' ? 'cobrador' : 'admin';
      const seeded = createAutostartDataset();
      const userSucursalId = roleParam === 'admin' ? 'suc-tienda-1' : 'suc-tienda-2';
      setDataset(seeded);
      setActiveSucursalIdState(userSucursalId);
      setUser({
        uid: roleParam === 'admin' ? 'local-admin' : 'local-cobrador',
        nombre: roleParam === 'admin' ? 'Administrador Alquia' : 'Laura Cobrador',
        correo: roleParam === 'admin' ? PRIMARY_ADMIN_EMAIL : 'cobrador@muebleriaalquia.mx',
        rol: roleParam,
        sucursalId: userSucursalId,
        activo: true,
        emailVerified: true,
        modo: 'local',
      });
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setDataset(createEmptyDataset());
        setActiveSucursalIdState('');
        setAuthReady(true);
        return;
      }

      const bootstrapAdmin = isBootstrapEmail(fbUser.email);
      let rol: UserRole = bootstrapAdmin ? 'admin' : 'cobrador';
      let nombre = fbUser.displayName || fbUser.email?.split('@')[0] || 'Personal Alquia';
      let activo = true;
      const defaultPersonalSucursalId = `suc-${fbUser.uid.slice(0, 24)}`.replace(/[^a-zA-Z0-9_-]/g, '');
      let sucursalId = defaultPersonalSucursalId;

      try {
        const userRef = doc(db, 'usuarios', fbUser.uid);
        // Leer siempre primero del servidor para evitar roles cacheados obsoletos (admin -> cobrador)
        const snap = await getDocFromServer(userRef).catch(() => getDoc(userRef));
        if (snap.exists()) {
          const data = snap.data();
          rol = bootstrapAdmin ? 'admin' : normalizeRole(data.rol);
          nombre = typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre : nombre;
          activo = typeof data.activo === 'boolean' ? data.activo : true;
          if (typeof data.sucursalId === 'string' && data.sucursalId.trim()) {
            sucursalId = data.sucursalId.trim();
          } else if (fbUser.emailVerified) {
            // Auto-reparación: guardar sucursal personal faltante en el perfil existente
            await updateDoc(userRef, { sucursalId: defaultPersonalSucursalId }).catch((err) =>
              console.warn('No se pudo asignar la sucursal personal faltante:', err)
            );
          }
        } else if (fbUser.emailVerified) {
          // Auto-provision staff profile FIRST so isStaff() evaluates true before touching sucursales
          await setDoc(userRef, {
            uid: fbUser.uid,
            nombre: nombre.slice(0, 100),
            correo: (fbUser.email || '').slice(0, 150),
            rol,
            sucursalId,
            activo: true,
            creadoEn: serverTimestamp(),
          });
        }

        // Auto-reparación: si el usuario ya verificado tiene sucursal personal pero aún no existe el documento en sucursales, crearlo
        if (fbUser.emailVerified && sucursalId && (sucursalId === defaultPersonalSucursalId || bootstrapAdmin)) {
          const sucRef = doc(db, 'sucursales', sucursalId);
          const sucSnap = await getDoc(sucRef).catch(() => null);
          if (!sucSnap || !sucSnap.exists()) {
            await setDoc(sucRef, {
              nombre: bootstrapAdmin ? 'Tienda Principal' : `Tienda de ${nombre}`.slice(0, 100),
              direccion: DEFAULT_CONFIG.ubicacion,
              telefono: DEFAULT_CONFIG.telefono,
              encargadoUid: fbUser.uid,
              encargadoNombre: nombre.slice(0, 100),
              propietarioUid: fbUser.uid,
              activa: true,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            }).catch((err) => console.warn('No se pudo crear la sucursal inicial:', err));
          }
        }
      } catch (err) {
        console.warn('No se pudo leer o inicializar el perfil de usuario en Firestore:', err);
      }

      setActiveSucursalIdState(sucursalId);
      setUser({
        uid: fbUser.uid,
        nombre,
        correo: fbUser.email || '',
        rol,
        sucursalId,
        activo,
        emailVerified: fbUser.emailVerified,
        modo: 'firebase',
      });
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Resolve current active store (Admin can switch to inspect any store; Cobrador stays on their assigned store)
  const setActiveSucursalId = useCallback(
    (nextId: string) => {
      if (user?.rol === 'admin') {
        setActiveSucursalIdState(nextId);
      }
    },
    [user?.rol]
  );

  const currentSucursal = useMemo<Sucursal | null>(() => {
    const targetId = user?.rol === 'admin' ? activeSucursalId || user.sucursalId : user?.sucursalId;
    if (targetId) {
      const exact = dataset.sucursales.find((s) => s.id === targetId);
      if (exact) return exact;
    }
    const owned = user ? dataset.sucursales.find((s) => s.propietarioUid === user.uid) : undefined;
    return owned || dataset.sucursales[0] || null;
  }, [dataset.sucursales, activeSucursalId, user]);

  const effectiveSucursalId = currentSucursal?.id || user?.sucursalId || 'suc-principal';

  // Cada miembro del personal abre, opera y cierra ÚNICAMENTE su propia caja
  const activeCajaTurno = useMemo<CajaTurno | null>(() => {
    if (!user) return null;
    return (
      dataset.cajasTurnos.find(
        (t) => t.estado === 'abierta' && t.abiertaPorUid === user.uid
      ) || null
    );
  }, [dataset.cajasTurnos, user]);

  const enrichTicket = useCallback(
    (base: TicketData): TicketData => ({
      ...base,
      sucursalNombre: base.sucursalNombre || currentSucursal?.nombre,
      sucursalDireccion:
        base.sucursalDireccion || currentSucursal?.direccion || dataset.configuracion.ubicacion,
      encargadoTienda: base.encargadoTienda || currentSucursal?.encargadoNombre || undefined,
    }),
    [currentSucursal, dataset.configuracion.ubicacion]
  );

  // Dependencias primitivas estables para evitar reconexiones innecesarias de los listeners en tiempo real
  const userUid = user?.uid ?? '';
  const userCorreo = user?.correo ?? '';
  const userRol = user?.rol;
  const userSucursalId = user?.sucursalId ?? '';
  const userActivo = user?.activo ?? false;
  const userEmailVerified = user?.emailVerified ?? false;
  const userModo = user?.modo;

  // Real-time Firestore listeners (cero retraso, sin límites que oculten registros nuevos)
  useEffect(() => {
    if (!authReady || !userUid || userModo !== 'firebase' || !userEmailVerified || !userActivo) {
      return;
    }

    setLoadingData(true);
    const unsubs: Array<() => void> = [];

    let roleResyncInFlight = false;
    const reportSnapshotError = (error: unknown, op: OperationType, path: string) => {
      const code = (error as { code?: string } | null)?.code || '';
      const msg = error instanceof Error ? error.message : String(error ?? '');
      const isPermDenied =
        code === 'permission-denied' || /permission-denied|insufficient permissions/i.test(msg);

      // Si el usuario tenía rol admin en cliente y acaba de pasar a cobrador en servidor,
      // resincronizar el perfil silenciosamente y reconectar con filtros de cobrador sin llenar el log de falsos errores.
      if (
        isPermDenied &&
        userRol === 'admin' &&
        ['usuarios', 'cajas_turnos', 'inventario_sucursales', 'productos', 'movimientos_inventario'].includes(path)
      ) {
        if (!roleResyncInFlight) {
          roleResyncInFlight = true;
          void getDocFromServer(doc(db, 'usuarios', userUid))
            .then((freshSnap) => {
              if (!freshSnap.exists()) return;
              const freshData = freshSnap.data();
              const liveRol: UserRole = isBootstrapEmail(userCorreo)
                ? 'admin'
                : normalizeRole(freshData.rol);
              const liveSucursal =
                typeof freshData.sucursalId === 'string' && freshData.sucursalId.trim()
                  ? freshData.sucursalId.trim()
                  : userSucursalId;
              const liveActivo =
                typeof freshData.activo === 'boolean' ? freshData.activo : true;
              if (liveRol !== 'admin' || !liveActivo) {
                setUser((prev) =>
                  prev && prev.uid === userUid
                    ? { ...prev, rol: liveRol, sucursalId: liveSucursal, activo: liveActivo }
                    : prev
                );
                if (liveRol !== 'admin' && liveSucursal) {
                  setActiveSucursalIdState(liveSucursal);
                }
              } else {
                try {
                  handleFirestoreError(error, op, path);
                } catch (caught) {
                  notify(formatFriendlyErrorMessage(caught), 'error');
                }
              }
            })
            .catch(() => {
              try {
                handleFirestoreError(error, op, path);
              } catch (caught) {
                notify(formatFriendlyErrorMessage(caught), 'error');
              }
            });
        }
        return;
      }

      try {
        handleFirestoreError(error, op, path);
      } catch (caught) {
        notify(formatFriendlyErrorMessage(caught), 'error');
      }
    };

    const configRef = doc(db, 'configuracion', 'tienda');
    unsubs.push(
      onSnapshot(
        configRef,
        (snap) => {
          if (snap.exists()) {
            const parsed = parseConfigData(
              snap.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>
            );
            setDataset((prev) => ({ ...prev, configuracion: parsed }));
          } else {
            void setDoc(configRef, {
              ...DEFAULT_CONFIG,
              tiendaId: TIENDA_ID,
              actualizadoEn: serverTimestamp(),
            }).catch((err) => {
              logAppError({
                source: 'firestore',
                action: 'initConfiguracion',
                error: err,
                severity: 'warning',
              });
            });
          }
        },
        (error) => reportSnapshotError(error, OperationType.GET, 'configuracion/tienda')
      )
    );

    // Mantener sincronizado el cargo/sucursal del usuario en tiempo real (si el Admin cambia su rol)
    const ownProfileRef = doc(db, 'usuarios', userUid);
    unsubs.push(
      onSnapshot(
        ownProfileRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data({ serverTimestamps: 'estimate' });
          const nextRol: UserRole = isBootstrapEmail(userCorreo)
            ? 'admin'
            : normalizeRole(data.rol);
          const nextActivo = typeof data.activo === 'boolean' ? data.activo : true;
          const nextSucursalId =
            typeof data.sucursalId === 'string' && data.sucursalId.trim()
              ? data.sucursalId.trim()
              : userSucursalId;

          setUser((prev) => {
            if (!prev || prev.uid !== userUid) return prev;
            const nextNombre =
              typeof data.nombre === 'string' && data.nombre.trim()
                ? data.nombre.trim()
                : prev.nombre;

            if (
              prev.rol === nextRol &&
              prev.nombre === nextNombre &&
              prev.activo === nextActivo &&
              prev.sucursalId === nextSucursalId
            ) {
              return prev;
            }
            return {
              ...prev,
              rol: nextRol,
              nombre: nextNombre,
              activo: nextActivo,
              sucursalId: nextSucursalId,
            };
          });
          if (nextRol !== 'admin' && nextSucursalId) {
            setActiveSucursalIdState(nextSucursalId);
          }
        },
        (error) => reportSnapshotError(error, OperationType.GET, `usuarios/${userUid}`)
      )
    );

    if (userRol === 'admin') {
      const staffQuery = query(
        collection(db, 'usuarios'),
        where('rol', 'in', ['admin', 'cobrador', 'cajero'])
      );
      unsubs.push(
        onSnapshot(
          staffQuery,
          (snapshot) => {
            const list: StaffMember[] = snapshot.docs.map((d) => {
              const raw = d.data({ serverTimestamps: 'estimate' });
              return {
                uid: typeof raw.uid === 'string' ? raw.uid : d.id,
                nombre: typeof raw.nombre === 'string' ? raw.nombre : 'Operador',
                correo: typeof raw.correo === 'string' ? raw.correo : '',
                rol: normalizeRole(raw.rol),
                sucursalId: typeof raw.sucursalId === 'string' ? raw.sucursalId : undefined,
                activo: typeof raw.activo === 'boolean' ? raw.activo : true,
                creadoEn: toISOStringSafe(raw.creadoEn),
              };
            });
            setDataset((prev) => ({ ...prev, usuarios: sortByCreatedDesc(list) }));
          },
          (error) => reportSnapshotError(error, OperationType.LIST, 'usuarios')
        )
      );
    } else {
      setDataset((prev) => (prev.usuarios.length > 0 ? { ...prev, usuarios: [] } : prev));
    }

    const listenCollection = <T extends { id: string; creadoEn: string }>(
      colName: string,
      setter: (items: T[]) => void
    ) => {
      const q = query(collection(db, colName), where('tiendaId', '==', TIENDA_ID));
      unsubs.push(
        onSnapshot(
          q,
          (snapshot) => {
            const list = snapshot.docs.map((d) => {
              const raw = d.data({ serverTimestamps: 'estimate' });
              return {
                ...raw,
                id: d.id,
                creadoEn: toISOStringSafe(raw.creadoEn || raw.abiertaEn || raw.actualizadoEn),
                actualizadoEn: raw.actualizadoEn ? toISOStringSafe(raw.actualizadoEn) : undefined,
              } as unknown as T;
            });
            setter(sortByCreatedDesc(list));
            setLoadingData(false);
          },
          (error) => {
            setLoadingData(false);
            reportSnapshotError(error, OperationType.LIST, colName);
          }
        )
      );
    };

    listenCollection<Sucursal>('sucursales', (sucursales) =>
      setDataset((p) => ({ ...p, sucursales }))
    );

    const userSucursalFilter =
      userSucursalId || `suc-${userUid.slice(0, 24)}`.replace(/[^a-zA-Z0-9_-]/g, '');

    // inventario_sucursales: estrictamente privado por tienda para no-administradores, sincronizado al instante
    const invQuery =
      userRol === 'admin'
        ? query(collection(db, 'inventario_sucursales'), where('tiendaId', '==', TIENDA_ID))
        : query(
            collection(db, 'inventario_sucursales'),
            where('tiendaId', '==', TIENDA_ID),
            where('sucursalId', '==', userSucursalFilter)
          );

    unsubs.push(
      onSnapshot(
        invQuery,
        (snapshot) => {
          const list: InventarioSucursal[] = snapshot.docs.map((d) => {
            const raw = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              sucursalId: String(raw.sucursalId || ''),
              sucursalNombre: String(raw.sucursalNombre || 'Tienda'),
              productoId: String(raw.productoId || ''),
              propietarioUid: String(raw.propietarioUid || ''),
              stockDisponible: Number(raw.stockDisponible) || 0,
              stockReservado: Number(raw.stockReservado) || 0,
              stockMinimo: Number(raw.stockMinimo) || 1,
              actualizadoEn: toISOStringSafe(raw.actualizadoEn),
            };
          });
          setDataset((p) => ({ ...p, inventarioSucursales: list }));
        },
        (error) => reportSnapshotError(error, OperationType.LIST, 'inventario_sucursales')
      )
    );

    // cajas_turnos: cada cobrador solo consulta sus propios turnos/cortes; Admin ve los de todos los cobradores
    const cajasQuery =
      userRol === 'admin'
        ? query(collection(db, 'cajas_turnos'), where('tiendaId', '==', TIENDA_ID))
        : query(
            collection(db, 'cajas_turnos'),
            where('tiendaId', '==', TIENDA_ID),
            where('abiertaPorUid', '==', userUid)
          );

    unsubs.push(
      onSnapshot(
        cajasQuery,
        (snapshot) => {
          const list: CajaTurno[] = snapshot.docs
            .map((d) => {
              const raw = d.data({ serverTimestamps: 'estimate' });
              return {
                id: d.id,
                sucursalId: typeof raw.sucursalId === 'string' ? raw.sucursalId : undefined,
                sucursalNombre:
                  typeof raw.sucursalNombre === 'string' ? raw.sucursalNombre : undefined,
                sucursalDireccion:
                  typeof raw.sucursalDireccion === 'string' ? raw.sucursalDireccion : undefined,
                encargadoTienda:
                  typeof raw.encargadoTienda === 'string' ? raw.encargadoTienda : undefined,
                abiertaPorUid: String(raw.abiertaPorUid || ''),
                abiertaPorNombre: String(raw.abiertaPorNombre || ''),
                fondoInicial: Number(raw.fondoInicial) || 0,
                estado: raw.estado === 'cerrada' ? 'cerrada' : 'abierta',
                abiertaEn: toISOStringSafe(raw.abiertaEn),
                cerradaEn: raw.cerradaEn ? toISOStringSafe(raw.cerradaEn) : undefined,
                cerradaPorUid:
                  typeof raw.cerradaPorUid === 'string' ? raw.cerradaPorUid : undefined,
                cerradaPorNombre:
                  typeof raw.cerradaPorNombre === 'string' ? raw.cerradaPorNombre : undefined,
                totalVentasDia:
                  typeof raw.totalVentasDia === 'number' ? raw.totalVentasDia : undefined,
                totalAbonosDia:
                  typeof raw.totalAbonosDia === 'number' ? raw.totalAbonosDia : undefined,
                totalEfectivo:
                  typeof raw.totalEfectivo === 'number' ? raw.totalEfectivo : undefined,
                totalTarjeta: typeof raw.totalTarjeta === 'number' ? raw.totalTarjeta : undefined,
                totalTransferencia:
                  typeof raw.totalTransferencia === 'number' ? raw.totalTransferencia : undefined,
                cantidadVentasBorradas:
                  typeof raw.cantidadVentasBorradas === 'number'
                    ? raw.cantidadVentasBorradas
                    : undefined,
                notasCierre: typeof raw.notasCierre === 'string' ? raw.notasCierre : undefined,
              } as CajaTurno;
            })
            .sort((a, b) => (a.abiertaEn < b.abiertaEn ? 1 : -1));
          setDataset((p) => ({ ...p, cajasTurnos: list }));
        },
        (error) => reportSnapshotError(error, OperationType.LIST, 'cajas_turnos')
      )
    );

    listenCollection<Cliente>('clientes', (clientes) => setDataset((p) => ({ ...p, clientes })));
    listenCollection<Proveedor>('proveedores', (proveedores) =>
      setDataset((p) => ({ ...p, proveedores }))
    );

    // productos: base de datos privada por tienda (cobradores solo leen productos de su propia tienda), tiempo real
    const productosQuery =
      userRol === 'admin'
        ? query(collection(db, 'productos'), where('tiendaId', '==', TIENDA_ID))
        : query(
            collection(db, 'productos'),
            where('tiendaId', '==', TIENDA_ID),
            where('creadoPorSucursalId', '==', userSucursalFilter)
          );
    unsubs.push(
      onSnapshot(
        productosQuery,
        (snapshot) => {
          const list = snapshot.docs.map((d) => {
            const raw = d.data({ serverTimestamps: 'estimate' });
            return {
              ...raw,
              id: d.id,
              creadoEn: toISOStringSafe(raw.creadoEn),
              actualizadoEn: raw.actualizadoEn ? toISOStringSafe(raw.actualizadoEn) : undefined,
            } as unknown as Producto;
          });
          setDataset((p) => ({ ...p, productos: sortByCreatedDesc(list) }));
          setLoadingData(false);
        },
        (error) => {
          setLoadingData(false);
          reportSnapshotError(error, OperationType.LIST, 'productos');
        }
      )
    );

    listenCollection<Venta>('ventas', (ventas) => setDataset((p) => ({ ...p, ventas })));
    listenCollection<Credito>('creditos', (creditos) => setDataset((p) => ({ ...p, creditos })));
    listenCollection<Apartado>('apartados', (apartados) =>
      setDataset((p) => ({ ...p, apartados }))
    );
    listenCollection<Abono>('abonos', (abonos) =>
      setDataset((p) => ({
        ...p,
        abonos: abonos.map((ab) => ({
          ...ab,
          estadoPuntualidad: ab.estadoPuntualidad === 'atrasado' ? 'atrasado' : 'al_dia',
          diasAtraso: typeof ab.diasAtraso === 'number' ? ab.diasAtraso : 0,
        })),
      }))
    );
    listenCollection<AlertaVencimiento>('alertas_vencimiento', (alertas) =>
      setDataset((p) => ({ ...p, alertas }))
    );

    // movimientos_inventario: kardex privado por tienda para no-administradores, tiempo real
    const movQuery =
      userRol === 'admin'
        ? query(collection(db, 'movimientos_inventario'), where('tiendaId', '==', TIENDA_ID))
        : query(
            collection(db, 'movimientos_inventario'),
            where('tiendaId', '==', TIENDA_ID),
            where('sucursalId', '==', userSucursalFilter)
          );
    unsubs.push(
      onSnapshot(
        movQuery,
        (snapshot) => {
          const list = snapshot.docs.map((d) => {
            const raw = d.data({ serverTimestamps: 'estimate' });
            return {
              ...raw,
              id: d.id,
              creadoEn: toISOStringSafe(raw.creadoEn),
            } as unknown as MovimientoInventario;
          });
          setDataset((p) => ({ ...p, movimientos: sortByCreatedDesc(list) }));
        },
        (error) => reportSnapshotError(error, OperationType.LIST, 'movimientos_inventario')
      )
    );

    listenCollection<CompraProveedor>('compras_proveedores', (compras) =>
      setDataset((p) => ({ ...p, compras }))
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [
    authReady,
    userUid,
    userCorreo,
    userRol,
    userSucursalId,
    userActivo,
    userEmailVerified,
    userModo,
    notify,
  ]);

  // Limpieza automática del corte de caja específico solicitado por el Administrador
  // (24 nov 2026 · Tienda Principal · Diego Olivares Hernández · $93,213.00 · $0.00 · 2)
  useEffect(() => {
    if (
      cleanedRequestedShiftRef.current ||
      !user ||
      user.rol !== 'admin' ||
      user.modo !== 'firebase' ||
      dataset.cajasTurnos.length === 0
    ) {
      return;
    }
    const target = dataset.cajasTurnos.find(
      (t) =>
        t.estado === 'cerrada' &&
        Math.abs((t.totalVentasDia || 0) - 93213) < 0.01 &&
        Math.abs(t.totalAbonosDia || 0) < 0.01 &&
        (t.cantidadVentasBorradas ?? 0) === 2 &&
        ((t.cerradaPorNombre || '').toLowerCase().includes('diego olivares') ||
          (t.abiertaPorNombre || '').toLowerCase().includes('diego olivares'))
    );
    if (target) {
      cleanedRequestedShiftRef.current = true;
      void deleteDoc(doc(db, 'cajas_turnos', target.id)).catch((err) => {
        console.warn('No se pudo depurar el corte de caja solicitado:', err);
      });
    }
  }, [user, dataset.cajasTurnos]);

  // Limpieza automática de los 5 movimientos específicos de Kardex solicitados por el Administrador
  // (24 nov 2026 · Principal · SALA DE 3 PIESA · C976987)
  useEffect(() => {
    if (
      !user ||
      user.rol !== 'admin' ||
      user.modo !== 'firebase' ||
      dataset.movimientos.length === 0
    ) {
      return;
    }

    const targets = dataset.movimientos.filter((m) => {
      if (cleanedRequestedMovIdsRef.current.has(m.id)) return false;
      const sku = (m.productoSku || '').trim().toUpperCase();
      const nombre = (m.productoNombre || '').trim().toUpperCase();
      if (sku !== 'C976987' || !nombre.includes('SALA DE 3 PIESA')) return false;

      const isAdj7to8 =
        m.tipo === 'ajuste' && m.cantidad === 1 && m.stockAnterior === 7 && m.stockNuevo === 8;
      const isAdj6to7 =
        m.tipo === 'ajuste' && m.cantidad === 1 && m.stockAnterior === 6 && m.stockNuevo === 7;
      const isSaleCR =
        m.tipo === 'venta' && m.cantidad === -1 && m.stockAnterior === 7 && m.stockNuevo === 6;
      const isSaleV =
        m.tipo === 'venta' && m.cantidad === -1 && m.stockAnterior === 8 && m.stockNuevo === 7;
      const isAdj2to8 =
        m.tipo === 'ajuste' && m.cantidad === 6 && m.stockAnterior === 2 && m.stockNuevo === 8;

      return isAdj7to8 || isAdj6to7 || isSaleCR || isSaleV || isAdj2to8;
    });

    if (targets.length > 0) {
      targets.forEach((m) => cleanedRequestedMovIdsRef.current.add(m.id));
      void Promise.all(
        targets.map((m) =>
          deleteDoc(doc(db, 'movimientos_inventario', m.id)).catch((err) => {
            console.warn('No se pudo depurar movimiento de kardex:', m.id, err);
          })
        )
      );
    }
  }, [user, dataset.movimientos]);

  // ------------------------------------------------------------------
  // Auth actions
  // ------------------------------------------------------------------
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const registerWithEmail = useCallback(
    async (nombre: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (nombre.trim()) {
        await updateProfile(cred.user, { displayName: nombre.trim() });
      }
      try {
        await sendEmailVerification(cred.user);
        notify('Cuenta creada. Revisa tu correo para verificar tu dirección antes de operar.');
      } catch {
        notify('Cuenta creada. Verifica tu correo para habilitar escritura en Firebase.');
      }
    },
    [notify]
  );

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    notify('Correo de verificación reenviado. Revisa tu bandeja de entrada o spam.');
  }, [notify]);

  const refreshAuthUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await reload(auth.currentUser);
    const updated = auth.currentUser;
    setUser((prev) => (prev ? { ...prev, emailVerified: updated.emailVerified } : null));
    if (updated.emailVerified) {
      notify('Correo verificado correctamente. Conectando con Firestore...');
    } else {
      notify('Tu correo aún aparece sin verificar. Haz clic en el enlace recibido.', 'error');
    }
  }, [notify]);

  const logout = useCallback(async () => {
    if (user?.modo === 'firebase') {
      await signOut(auth);
    }
    setUser(null);
    setDataset(createEmptyDataset());
    setActiveTicket(null);
    setActiveSucursalIdState('');
  }, [user]);

  const assertWritable = useCallback(() => {
    if (!user) throw new Error('Inicia sesión para realizar esta operación.');
    if (user.modo === 'firebase' && !user.emailVerified) {
      throw new Error('Verifica tu correo electrónico antes de guardar datos.');
    }
    if (!user.activo) {
      throw new Error('Tu cuenta está desactivada. Contacta al Administrador.');
    }
  }, [user]);

  // ------------------------------------------------------------------
  // Monitor automático de fechas de vencimiento (créditos y apartados)
  // ------------------------------------------------------------------
  const runAutoDueAlertsCheck = useCallback(
    async (silent: boolean = false): Promise<{ created: number; emailed: number }> => {
      if (!user || !user.activo) return { created: 0, emailed: 0 };
      if (user.modo === 'firebase' && !user.emailVerified) return { created: 0, emailed: 0 };
      if (alertMonitorRunningRef.current) return { created: 0, emailed: 0 };

      alertMonitorRunningRef.current = true;
      try {
        const pending = evaluateDueAlerts({
          creditos: dataset.creditos,
          apartados: dataset.apartados,
          existingAlerts: dataset.alertas,
          diasAnticipacion: dataset.configuracion.diasAnticipacionAlerta,
          correoDestino: dataset.configuracion.correoAlertas || PRIMARY_ADMIN_EMAIL,
          nombreTienda: dataset.configuracion.nombreComercial,
          plantillaAsunto: dataset.configuracion.plantillaAsuntoAlerta,
          plantillaCuerpo: dataset.configuracion.plantillaCuerpoAlerta,
        });

        if (pending.length === 0) {
          if (!silent) {
            notify('Revisión completada: no hay nuevas alertas pendientes hoy.');
          }
          return { created: 0, emailed: 0 };
        }

        let created = 0;
        let emailed = 0;
        const createdLocal: AlertaVencimiento[] = [];
        const now = new Date().toISOString();

        for (const item of pending.slice(0, 15)) {
          const emailRes = await dispatchAlertEmailViaEmailJS({
            serviceId: dataset.configuracion.emailjsServiceId,
            templateId: dataset.configuracion.emailjsTemplateId,
            publicKey: dataset.configuracion.emailjsPublicKey,
            alert: item,
          });
          if (emailRes.sent) emailed += 1;

          const id = makeId('al');
          const estadoAlerta: 'enviada' | 'pendiente' = emailRes.sent ? 'enviada' : 'pendiente';

          if (user.modo === 'firebase') {
            try {
              await setDoc(doc(db, 'alertas_vencimiento', id), {
                operacionTipo: item.operacionTipo,
                operacionId: item.operacionId,
                operacionFolio: item.operacionFolio,
                tipoAlerta: item.tipoAlerta,
                claveAlerta: item.claveAlerta,
                clienteId: item.clienteId,
                clienteNombre: item.clienteNombre,
                clienteTelefono: item.clienteTelefono,
                montoAPagar: item.montoAPagar,
                saldoPendiente: item.saldoPendiente,
                fechaLimite: item.fechaLimite,
                diasAtraso: item.diasAtraso,
                diasRestantes: item.diasRestantes,
                correoDestino: item.correoDestino,
                asunto: item.asunto,
                mensaje: item.mensaje,
                metodoEnvio: emailRes.method,
                estado: estadoAlerta,
                creadoPorUid: user.uid,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
              created += 1;
            } catch (err) {
              console.warn('Error registrando alerta automática:', err);
            }
          } else {
            createdLocal.push({
              id,
              operacionTipo: item.operacionTipo,
              operacionId: item.operacionId,
              operacionFolio: item.operacionFolio,
              tipoAlerta: item.tipoAlerta,
              claveAlerta: item.claveAlerta,
              clienteId: item.clienteId,
              clienteNombre: item.clienteNombre,
              clienteTelefono: item.clienteTelefono,
              montoAPagar: item.montoAPagar,
              saldoPendiente: item.saldoPendiente,
              fechaLimite: item.fechaLimite,
              diasAtraso: item.diasAtraso,
              diasRestantes: item.diasRestantes,
              correoDestino: item.correoDestino,
              asunto: item.asunto,
              mensaje: item.mensaje,
              metodoEnvio: emailRes.method,
              estado: estadoAlerta,
              creadoPorUid: user.uid,
              creadoEn: now,
            });
            created += 1;
          }
        }

        if (user.modo === 'local' && createdLocal.length > 0) {
          setDataset((prev) => ({
            ...prev,
            alertas: [...createdLocal, ...prev.alertas],
          }));
        }

        if (!silent) {
          notify(
            emailed > 0
              ? `Se generaron ${created} alerta(s) y se enviaron ${emailed} correo(s) automáticos.`
              : `Se registraron ${created} alerta(s) de vencimiento listas para enviar por correo.`
          );
        }

        return { created, emailed };
      } finally {
        alertMonitorRunningRef.current = false;
      }
    },
    [user, dataset.creditos, dataset.apartados, dataset.alertas, dataset.configuracion, notify]
  );

  // Disparo automático en segundo plano cuando hay cuentas vencidas o próximas a vencer
  useEffect(() => {
    if (!authReady || !user || !user.activo) return;
    if (!dataset.configuracion.alertasAutomaticasActivas) return;
    if (dataset.creditos.length === 0 && dataset.apartados.length === 0) return;

    const key = `${todayISODate()}_${dataset.creditos.length}_${dataset.apartados.length}_${dataset.configuracion.diasAnticipacionAlerta}`;
    if (alertMonitorLastKeyRef.current === key) return;
    alertMonitorLastKeyRef.current = key;

    const timer = setTimeout(() => {
      void runAutoDueAlertsCheck(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    authReady,
    user,
    dataset.configuracion.alertasAutomaticasActivas,
    dataset.configuracion.diasAnticipacionAlerta,
    dataset.creditos.length,
    dataset.apartados.length,
    runAutoDueAlertsCheck,
  ]);

  // ------------------------------------------------------------------
  // Configuración, Personal y Sucursales
  // ------------------------------------------------------------------
  const saveConfiguracion = useCallback(
    async (
      input: Partial<
        Pick<
          ConfiguracionTienda,
          | 'nombreComercial'
          | 'ubicacion'
          | 'telefono'
          | 'mensajeTicket'
          | 'correoAlertas'
          | 'diasAnticipacionAlerta'
          | 'alertasAutomaticasActivas'
          | 'plantillaAsuntoAlerta'
          | 'plantillaCuerpoAlerta'
          | 'emailjsServiceId'
          | 'emailjsTemplateId'
          | 'emailjsPublicKey'
        >
      >
    ) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede editar la configuración.');
      }

      const next: ConfiguracionTienda = {
        ...dataset.configuracion,
        nombreComercial:
          typeof input.nombreComercial === 'string'
            ? input.nombreComercial.trim().slice(0, 120) || DEFAULT_CONFIG.nombreComercial
            : dataset.configuracion.nombreComercial,
        ubicacion:
          typeof input.ubicacion === 'string'
            ? input.ubicacion.trim().slice(0, 160)
            : dataset.configuracion.ubicacion,
        telefono:
          typeof input.telefono === 'string'
            ? input.telefono.trim().slice(0, 40)
            : dataset.configuracion.telefono,
        mensajeTicket:
          typeof input.mensajeTicket === 'string'
            ? input.mensajeTicket.trim().slice(0, 200)
            : dataset.configuracion.mensajeTicket,
        correoAlertas:
          typeof input.correoAlertas === 'string'
            ? input.correoAlertas.trim().slice(0, 150) || PRIMARY_ADMIN_EMAIL
            : dataset.configuracion.correoAlertas,
        diasAnticipacionAlerta:
          typeof input.diasAnticipacionAlerta === 'number'
            ? Math.max(0, Math.min(30, Math.floor(input.diasAnticipacionAlerta)))
            : dataset.configuracion.diasAnticipacionAlerta,
        alertasAutomaticasActivas:
          typeof input.alertasAutomaticasActivas === 'boolean'
            ? input.alertasAutomaticasActivas
            : dataset.configuracion.alertasAutomaticasActivas,
        plantillaAsuntoAlerta:
          typeof input.plantillaAsuntoAlerta === 'string'
            ? input.plantillaAsuntoAlerta.trim().slice(0, 180) || DEFAULT_ALERT_SUBJECT_TEMPLATE
            : dataset.configuracion.plantillaAsuntoAlerta,
        plantillaCuerpoAlerta:
          typeof input.plantillaCuerpoAlerta === 'string'
            ? input.plantillaCuerpoAlerta.trim().slice(0, 1200) || DEFAULT_ALERT_BODY_TEMPLATE
            : dataset.configuracion.plantillaCuerpoAlerta,
        emailjsServiceId:
          typeof input.emailjsServiceId === 'string'
            ? input.emailjsServiceId.trim().slice(0, 80)
            : dataset.configuracion.emailjsServiceId,
        emailjsTemplateId:
          typeof input.emailjsTemplateId === 'string'
            ? input.emailjsTemplateId.trim().slice(0, 80)
            : dataset.configuracion.emailjsTemplateId,
        emailjsPublicKey:
          typeof input.emailjsPublicKey === 'string'
            ? input.emailjsPublicKey.trim().slice(0, 80)
            : dataset.configuracion.emailjsPublicKey,
      };

      if (user.modo === 'firebase') {
        try {
          await runTransaction(db, async (tx) => {
            const ref = doc(db, 'configuracion', 'tienda');
            const snap = await tx.get(ref);
            const live = parseConfigData(
              snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
            );
            writeConfigInTransaction(tx, snap.exists(), {
              ...live,
              ...next,
              consecutivoVenta: live.consecutivoVenta,
              consecutivoCredito: live.consecutivoCredito,
              consecutivoApartado: live.consecutivoApartado,
              consecutivoAbono: live.consecutivoAbono,
              consecutivoCompra: live.consecutivoCompra,
            });
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'configuracion/tienda');
        }
      } else {
        setDataset((prev) => ({ ...prev, configuracion: next }));
      }
      notify('Configuración guardada correctamente.');
    },
    [assertWritable, user, dataset.configuracion, notify]
  );

  const saveUsuarioStaff = useCallback(
    async (input: {
      uid: string;
      nombre: string;
      correo: string;
      rol: UserRole;
      sucursalId?: string;
      activo: boolean;
    }) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede asignar cargos al personal.');
      }
      const cleanUid = input.uid.trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanUid)) {
        throw new Error('Ingresa un UID válido de usuario.');
      }
      const cleanNombre = input.nombre.trim().slice(0, 100);
      const cleanCorreo = input.correo.trim().slice(0, 150);
      if (!cleanNombre || !cleanCorreo) {
        throw new Error('Nombre y correo son obligatorios.');
      }
      const cleanSucursalId =
        input.sucursalId && /^[a-zA-Z0-9_-]{1,128}$/.test(input.sucursalId.trim())
          ? input.sucursalId.trim()
          : `suc-${cleanUid.slice(0, 24)}`;

      const existing = dataset.usuarios.find((u) => u.uid === cleanUid);

      if (user.modo === 'firebase') {
        try {
          const ref = doc(db, 'usuarios', cleanUid);
          const sucRef = doc(db, 'sucursales', cleanSucursalId);
          const sucSnap = await getDoc(sucRef).catch(() => null);
          const batch = writeBatch(db);
          if (existing) {
            batch.update(ref, {
              nombre: cleanNombre,
              rol: input.rol,
              sucursalId: cleanSucursalId,
              activo: input.activo,
            });
          } else {
            batch.set(ref, {
              uid: cleanUid,
              nombre: cleanNombre,
              correo: cleanCorreo,
              rol: input.rol,
              sucursalId: cleanSucursalId,
              activo: input.activo,
              creadoEn: serverTimestamp(),
            });
          }
          if (!sucSnap || !sucSnap.exists()) {
            batch.set(sucRef, {
              nombre: `Tienda de ${cleanNombre}`.slice(0, 100),
              direccion: DEFAULT_CONFIG.ubicacion,
              telefono: DEFAULT_CONFIG.telefono,
              encargadoUid: cleanUid,
              encargadoNombre: cleanNombre,
              propietarioUid: cleanUid,
              activa: true,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(
            err,
            existing ? OperationType.UPDATE : OperationType.CREATE,
            `usuarios/${cleanUid}`
          );
        }
      } else {
        const entry: StaffMember = {
          uid: cleanUid,
          nombre: cleanNombre,
          correo: cleanCorreo,
          rol: input.rol,
          sucursalId: cleanSucursalId,
          activo: input.activo,
          creadoEn: existing ? existing.creadoEn : new Date().toISOString(),
        };
        setDataset((prev) => ({
          ...prev,
          usuarios: existing
            ? prev.usuarios.map((u) => (u.uid === cleanUid ? entry : u))
            : [entry, ...prev.usuarios],
        }));
      }
      notify(`Cargo de "${cleanNombre}" actualizado a ${input.rol.toUpperCase()}.`);
    },
    [assertWritable, user, dataset.usuarios, notify]
  );

  const saveSucursal = useCallback(
    async (input: {
      id?: string;
      nombre: string;
      direccion: string;
      telefono?: string;
      encargadoUid?: string;
      encargadoNombre?: string;
      propietarioUid?: string;
      activa?: boolean;
    }) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede configurar tiendas y encargados.');
      }
      const cleanNombre = input.nombre.trim().slice(0, 100);
      if (cleanNombre.length < 2) throw new Error('Ingresa el nombre de la tienda.');
      const cleanDir = input.direccion.trim().slice(0, 240);
      const cleanTel = (input.telefono || '').trim().slice(0, 40);
      const cleanEncUid = (input.encargadoUid || '').trim().slice(0, 128);
      const cleanEncNombre = (input.encargadoNombre || '').trim().slice(0, 100);
      const id = input.id || makeId('suc');
      const existing = dataset.sucursales.find((s) => s.id === id);
      const propUid = (input.propietarioUid || existing?.propietarioUid || user.uid).trim();
      const now = new Date().toISOString();

      if (user.modo === 'firebase') {
        try {
          const ref = doc(db, 'sucursales', id);
          if (existing) {
            await updateDoc(ref, {
              nombre: cleanNombre,
              direccion: cleanDir,
              telefono: cleanTel,
              encargadoUid: cleanEncUid,
              encargadoNombre: cleanEncNombre,
              propietarioUid: propUid,
              activa: input.activa ?? existing.activa,
              actualizadoEn: serverTimestamp(),
            });
          } else {
            await setDoc(ref, {
              nombre: cleanNombre,
              direccion: cleanDir,
              telefono: cleanTel,
              encargadoUid: cleanEncUid,
              encargadoNombre: cleanEncNombre,
              propietarioUid: propUid,
              activa: input.activa ?? true,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            existing ? OperationType.UPDATE : OperationType.CREATE,
            `sucursales/${id}`
          );
        }
      } else {
        const nextSuc: Sucursal = {
          id,
          nombre: cleanNombre,
          direccion: cleanDir,
          telefono: cleanTel,
          encargadoUid: cleanEncUid,
          encargadoNombre: cleanEncNombre,
          propietarioUid: propUid,
          activa: input.activa ?? true,
          creadoEn: existing ? existing.creadoEn : now,
          actualizadoEn: now,
        };
        setDataset((prev) => ({
          ...prev,
          sucursales: existing
            ? prev.sucursales.map((s) => (s.id === id ? nextSuc : s))
            : [nextSuc, ...prev.sucursales],
        }));
      }
      notify(`Tienda "${cleanNombre}" guardada correctamente.`);
    },
    [assertWritable, user, dataset.sucursales, notify]
  );

  const updateOwnSucursalAddress = useCallback(
    async (input: { direccion: string; telefono?: string }) => {
      assertWritable();
      if (!user || !currentSucursal) {
        throw new Error('No se encontró una tienda asignada a tu usuario.');
      }
      const cleanDir = input.direccion.trim().slice(0, 240);
      const cleanTel = (input.telefono ?? currentSucursal.telefono ?? '').trim().slice(0, 40);
      const now = new Date().toISOString();

      if (user.modo === 'firebase') {
        try {
          await updateDoc(doc(db, 'sucursales', currentSucursal.id), {
            direccion: cleanDir,
            telefono: cleanTel,
            actualizadoEn: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `sucursales/${currentSucursal.id}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          sucursales: prev.sucursales.map((s) =>
            s.id === currentSucursal.id
              ? { ...s, direccion: cleanDir, telefono: cleanTel, actualizadoEn: now }
              : s
          ),
        }));
      }
      notify('Dirección de tu tienda actualizada para los tickets.');
    },
    [assertWritable, user, currentSucursal, notify]
  );

  // ------------------------------------------------------------------
  // Caja (Apertura y Cierre — accesible para TODOS los usuarios activos)
  // ------------------------------------------------------------------
  const abrirCaja = useCallback(
    async (fondoInicial: number): Promise<CajaTurno> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para abrir caja.');
      if (activeCajaTurno) {
        throw new Error('Ya tienes tu caja personal abierta en este momento.');
      }
      const fondo = validateCajaFondoInicial(fondoInicial);
      const id = makeId('caja');
      const now = new Date().toISOString();

      const nuevoTurno: CajaTurno = {
        id,
        sucursalId: currentSucursal?.id || effectiveSucursalId,
        sucursalNombre: currentSucursal?.nombre || 'Tienda Principal',
        sucursalDireccion: currentSucursal?.direccion || dataset.configuracion.ubicacion,
        encargadoTienda: currentSucursal?.encargadoNombre || '',
        abiertaPorUid: user.uid,
        abiertaPorNombre: user.nombre,
        fondoInicial: fondo,
        estado: 'abierta',
        abiertaEn: now,
      };

      if (user.modo === 'firebase') {
        try {
          await setDoc(doc(db, 'cajas_turnos', id), {
            sucursalId: nuevoTurno.sucursalId,
            sucursalNombre: nuevoTurno.sucursalNombre,
            sucursalDireccion: nuevoTurno.sucursalDireccion,
            encargadoTienda: nuevoTurno.encargadoTienda,
            abiertaPorUid: user.uid,
            abiertaPorNombre: user.nombre,
            fondoInicial: fondo,
            estado: 'abierta',
            abiertaEn: serverTimestamp(),
            tiendaId: TIENDA_ID,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `cajas_turnos/${id}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          cajasTurnos: [nuevoTurno, ...prev.cajasTurnos],
        }));
      }
      notify(`Caja abierta con fondo inicial de ${formatMXN(fondo)}.`);
      return nuevoTurno;
    },
    [assertWritable, user, activeCajaTurno, currentSucursal, effectiveSucursalId, dataset.configuracion.ubicacion, notify]
  );

  const cerrarCaja = useCallback(
    async (input?: { notasCierre?: string }): Promise<{ ventasBorradas: number }> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para cerrar caja.');
      if (!activeCajaTurno) throw new Error('No tienes una caja abierta en este momento.');
      if (activeCajaTurno.abiertaPorUid !== user.uid && user.rol !== 'admin') {
        throw new Error('Solo puedes cerrar tu propia caja personal.');
      }

      const summary = summarizeCajaShift(activeCajaTurno, dataset.ventas, dataset.abonos);
      const ventasToDelete = summary.ventasDelDia;
      const notas = (input?.notasCierre || '').trim().slice(0, 240);
      const now = new Date().toISOString();

      if (user.modo === 'firebase') {
        try {
          await updateDoc(doc(db, 'cajas_turnos', activeCajaTurno.id), {
            estado: 'cerrada',
            cerradaEn: serverTimestamp(),
            cerradaPorUid: user.uid,
            cerradaPorNombre: user.nombre,
            totalVentasDia: summary.totalVentasImporte,
            totalAbonosDia: summary.totalAbonos,
            totalEfectivo: summary.porMetodo.efectivo,
            totalTarjeta: summary.porMetodo.tarjeta,
            totalTransferencia: summary.porMetodo.transferencia,
            cantidadVentasBorradas: ventasToDelete.length,
            notasCierre: notas,
          });

          // Borrar únicamente las ventas del día del usuario al cerrar su caja (manteniendo abonos e historial)
          for (let i = 0; i < ventasToDelete.length; i += 400) {
            const chunk = ventasToDelete.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((v) => {
              batch.delete(doc(db, 'ventas', v.id));
            });
            await batch.commit();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `cajas_turnos/${activeCajaTurno.id}`);
        }
      } else {
        const deletedIds = new Set(ventasToDelete.map((v) => v.id));
        setDataset((prev) => ({
          ...prev,
          cajasTurnos: prev.cajasTurnos.map((t) =>
            t.id === activeCajaTurno.id
              ? {
                  ...t,
                  estado: 'cerrada',
                  cerradaEn: now,
                  cerradaPorUid: user.uid,
                  cerradaPorNombre: user.nombre,
                  totalVentasDia: summary.totalVentasImporte,
                  totalAbonosDia: summary.totalAbonos,
                  totalEfectivo: summary.porMetodo.efectivo,
                  totalTarjeta: summary.porMetodo.tarjeta,
                  totalTransferencia: summary.porMetodo.transferencia,
                  cantidadVentasBorradas: ventasToDelete.length,
                  notasCierre: notas,
                }
              : t
          ),
          ventas: prev.ventas.filter((v) => !deletedIds.has(v.id)),
        }));
      }

      notify(
        `Tu caja personal se cerró. Se descargó el PDF y se limpiaron ${ventasToDelete.length} venta(s) de tu turno.`
      );
      return { ventasBorradas: ventasToDelete.length };
    },
    [assertWritable, user, activeCajaTurno, dataset.ventas, dataset.abonos, notify]
  );

  const deleteCajaTurno = useCallback(
    async (turnoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar cortes de caja.');
      }
      const target = dataset.cajasTurnos.find((t) => t.id === turnoId);
      if (!target) throw new Error('Corte de caja no encontrado.');

      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'cajas_turnos', turnoId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `cajas_turnos/${turnoId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          cajasTurnos: prev.cajasTurnos.filter((t) => t.id !== turnoId),
        }));
      }
      notify('Corte de caja eliminado del historial.');
    },
    [assertWritable, user, dataset.cajasTurnos, notify]
  );

  // ------------------------------------------------------------------
  // Clientes CRUD
  // ------------------------------------------------------------------
  const addCliente = useCallback(
    async (
      input: Omit<Cliente, 'id' | 'saldoAFavor' | 'activo' | 'creadoPorUid' | 'creadoEn'>
    ): Promise<Cliente> => {
      assertWritable();
      if (!user) throw new Error('Debes iniciar sesión.');
      const nombre = validateRequiredText(input.nombre, 'Nombre completo del cliente', 2, 120);
      const telefono = validatePhoneWhatsApp(input.telefono, true).slice(0, 30);

      const id = makeId('cli');
      const now = new Date().toISOString();
      const nuevo: Cliente = {
        id,
        nombre,
        telefono,
        direccion: input.direccion.trim().slice(0, 240),
        referencias: input.referencias.trim().slice(0, 240),
        saldoAFavor: 0,
        activo: true,
        creadoPorUid: user.uid,
        creadoEn: now,
      };

      if (user.modo === 'firebase') {
        try {
          await setDoc(doc(db, 'clientes', id), {
            nombre: nuevo.nombre,
            telefono: nuevo.telefono,
            direccion: nuevo.direccion,
            referencias: nuevo.referencias,
            saldoAFavor: 0,
            activo: true,
            creadoPorUid: user.uid,
            tiendaId: TIENDA_ID,
            creadoEn: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `clientes/${id}`);
        }
      } else {
        setDataset((prev) => ({ ...prev, clientes: [nuevo, ...prev.clientes] }));
      }
      notify(`Cliente "${nuevo.nombre}" registrado.`);
      return nuevo;
    },
    [assertWritable, user, notify]
  );

  const updateCliente = useCallback(
    async (
      clienteId: string,
      input: Pick<Cliente, 'nombre' | 'telefono' | 'direccion' | 'referencias'>
    ) => {
      assertWritable();
      if (!user) throw new Error('Debes iniciar sesión.');
      const nombre = input.nombre.trim().slice(0, 120);
      const telefono = input.telefono.trim().slice(0, 30);
      if (nombre.length < 2) throw new Error('El nombre debe tener al menos 2 caracteres.');
      if (telefono.length < 7) throw new Error('El teléfono debe tener al menos 7 dígitos.');
      const direccion = input.direccion.trim().slice(0, 240);
      const referencias = input.referencias.trim().slice(0, 240);

      if (user.modo === 'firebase') {
        try {
          await updateDoc(doc(db, 'clientes', clienteId), {
            nombre,
            telefono,
            direccion,
            referencias,
            actualizadoEn: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `clientes/${clienteId}`);
        }
      } else {
        const now = new Date().toISOString();
        setDataset((prev) => ({
          ...prev,
          clientes: prev.clientes.map((c) =>
            c.id === clienteId
              ? { ...c, nombre, telefono, direccion, referencias, actualizadoEn: now }
              : c
          ),
        }));
      }
      notify(`Datos de "${nombre}" actualizados.`);
    },
    [assertWritable, user, notify]
  );

  const deleteCliente = useCallback(
    async (clienteId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar clientes.');
      }
      const tieneCreditosActivos = dataset.creditos.some(
        (c) => c.clienteId === clienteId && c.estado === 'activo'
      );
      const tieneApartadosVigentes = dataset.apartados.some(
        (a) => a.clienteId === clienteId && a.estado === 'vigente'
      );
      if (tieneCreditosActivos || tieneApartadosVigentes) {
        throw new Error(
          'No puedes eliminar este cliente mientras tenga créditos activos o apartados vigentes.'
        );
      }

      const target = dataset.clientes.find((c) => c.id === clienteId);
      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'clientes', clienteId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `clientes/${clienteId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          clientes: prev.clientes.filter((c) => c.id !== clienteId),
        }));
      }
      notify(target ? `Cliente "${target.nombre}" eliminado.` : 'Cliente eliminado.');
    },
    [assertWritable, user, dataset.clientes, dataset.creditos, dataset.apartados, notify]
  );

  const clearAllClientes = useCallback(async (): Promise<{
    deleted: number;
    skippedActive: number;
  }> => {
    assertWritable();
    if (!user || user.rol !== 'admin') {
      throw new Error('Solo el Administrador puede vaciar el directorio de clientes.');
    }

    const activeClientIds = new Set<string>();
    dataset.creditos.forEach((c) => {
      if (c.estado === 'activo') activeClientIds.add(c.clienteId);
    });
    dataset.apartados.forEach((a) => {
      if (a.estado === 'vigente') activeClientIds.add(a.clienteId);
    });

    const deletable = dataset.clientes.filter((c) => !activeClientIds.has(c.id));
    const skippedActive = dataset.clientes.length - deletable.length;

    if (deletable.length === 0) {
      notify(
        skippedActive > 0
          ? 'No se eliminaron clientes porque tienen créditos o apartados vigentes.'
          : 'El directorio de clientes ya está vacío.',
        skippedActive > 0 ? 'error' : 'success'
      );
      return { deleted: 0, skippedActive };
    }

    if (user.modo === 'firebase') {
      try {
        for (let i = 0; i < deletable.length; i += 400) {
          const chunk = deletable.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach((cli) => batch.delete(doc(db, 'clientes', cli.id)));
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'clientes');
      }
    } else {
      const deletableIds = new Set(deletable.map((c) => c.id));
      setDataset((prev) => ({
        ...prev,
        clientes: prev.clientes.filter((c) => !deletableIds.has(c.id)),
      }));
    }

    notify(`Directorio actualizado: ${deletable.length} cliente(s) eliminado(s).`);
    return { deleted: deletable.length, skippedActive };
  }, [assertWritable, user, dataset.clientes, dataset.creditos, dataset.apartados, notify]);

  // ------------------------------------------------------------------
  // Productos (todos pueden agregar; SOLO Admin puede editar detalles o eliminar)
  // ------------------------------------------------------------------
  const saveProducto = useCallback(
    async (
      input: Omit<Producto, 'id' | 'creadoEn' | 'stockReservado'>,
      existingId?: string
    ) => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para agregar productos.');
      if (existingId && user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede editar productos existentes.');
      }

      const id = existingId || makeId('prod');
      const now = new Date().toISOString();
      const existing = existingId ? dataset.productos.find((p) => p.id === existingId) : undefined;
      validateProductoInput({
        sku: input.sku,
        nombre: input.nombre,
        precioContado: input.precioContado,
        precioCredito: input.precioCredito,
        costoUnitario: input.costoUnitario,
        stockDisponible: Math.floor(input.stockDisponible),
        stockMinimo: Math.floor(input.stockMinimo),
      });

      const cleanSku = input.sku
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '-')
        .slice(0, 40);

      if (cleanSku.length < 2) throw new Error('Ingresa un SKU válido (mínimo 2 caracteres).');
      const cleanNombre = input.nombre.trim().slice(0, 140);
      if (cleanNombre.length < 2) throw new Error('Ingresa el nombre del producto.');

      const ownStock = Math.max(0, Math.floor(input.stockDisponible));
      const stockMin = Math.max(0, Math.floor(input.stockMinimo));
      const storeName = currentSucursal?.nombre || 'Tienda Principal';
      const invId = makeInvDocId(effectiveSucursalId, id);

      const otherStoresStock = dataset.inventarioSucursales
        .filter((inv) => inv.productoId === id && inv.sucursalId !== effectiveSucursalId)
        .reduce((acc, inv) => acc + inv.stockDisponible, 0);
      const totalNetworkStock = otherStoresStock + ownStock;

      const prod: Producto = {
        id,
        sku: cleanSku,
        nombre: cleanNombre,
        categoria: input.categoria.trim().slice(0, 60) || 'General',
        marca: input.marca.trim().slice(0, 80),
        precioContado: roundMXN(Math.max(0, input.precioContado)),
        precioCredito: roundMXN(Math.max(0, input.precioCredito)),
        costoUnitario: roundMXN(Math.max(0, input.costoUnitario)),
        stockDisponible: existing ? totalNetworkStock : ownStock,
        stockReservado: existing ? existing.stockReservado : 0,
        stockMinimo: stockMin,
        proveedorId: input.proveedorId || '',
        creadoPorUid: existing?.creadoPorUid || user.uid,
        creadoPorSucursalId: existing?.creadoPorSucursalId || effectiveSucursalId,
        activo: input.activo,
        creadoEn: existing ? existing.creadoEn : now,
        actualizadoEn: now,
      };

      const invEntry: InventarioSucursal = {
        id: invId,
        sucursalId: effectiveSucursalId,
        sucursalNombre: storeName,
        productoId: id,
        propietarioUid: currentSucursal?.propietarioUid || user.uid,
        stockDisponible: ownStock,
        stockReservado: existing
          ? dataset.inventarioSucursales.find((i) => i.id === invId)?.stockReservado || 0
          : 0,
        stockMinimo: stockMin,
        actualizadoEn: now,
      };

      if (user.modo === 'firebase') {
        try {
          const ref = doc(db, 'productos', id);
          const invRef = doc(db, 'inventario_sucursales', invId);
          const invSnap = await getDoc(invRef);
          const batch = writeBatch(db);

          if (existing) {
            batch.update(ref, {
              sku: prod.sku,
              nombre: prod.nombre,
              categoria: prod.categoria,
              marca: prod.marca,
              precioContado: prod.precioContado,
              precioCredito: prod.precioCredito,
              costoUnitario: prod.costoUnitario,
              stockDisponible: prod.stockDisponible,
              stockMinimo: prod.stockMinimo,
              proveedorId: prod.proveedorId,
              activo: prod.activo,
              actualizadoEn: serverTimestamp(),
            });
          } else {
            batch.set(ref, {
              sku: prod.sku,
              nombre: prod.nombre,
              categoria: prod.categoria,
              marca: prod.marca,
              precioContado: prod.precioContado,
              precioCredito: prod.precioCredito,
              costoUnitario: prod.costoUnitario,
              stockDisponible: prod.stockDisponible,
              stockReservado: 0,
              stockMinimo: prod.stockMinimo,
              proveedorId: prod.proveedorId,
              creadoPorUid: user.uid,
              creadoPorSucursalId: effectiveSucursalId,
              activo: prod.activo,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });
          }

          // Escritura atómica del stock privado de esta tienda junto con el producto (sincronización instantánea sin desfase)
          if (invSnap.exists()) {
            batch.update(invRef, {
              sucursalNombre: invEntry.sucursalNombre,
              stockDisponible: invEntry.stockDisponible,
              stockReservado: invEntry.stockReservado,
              stockMinimo: invEntry.stockMinimo,
              actualizadoEn: serverTimestamp(),
            });
          } else {
            batch.set(invRef, {
              sucursalId: invEntry.sucursalId,
              sucursalNombre: invEntry.sucursalNombre,
              productoId: invEntry.productoId,
              propietarioUid: invEntry.propietarioUid,
              stockDisponible: invEntry.stockDisponible,
              stockReservado: invEntry.stockReservado,
              stockMinimo: invEntry.stockMinimo,
              tiendaId: TIENDA_ID,
              actualizadoEn: serverTimestamp(),
            });
          }

          await batch.commit();
        } catch (err) {
          handleFirestoreError(
            err,
            existing ? OperationType.UPDATE : OperationType.CREATE,
            `productos/${id}`
          );
        }
      } else {
        setDataset((prev) => {
          const hasInv = prev.inventarioSucursales.some((i) => i.id === invId);
          return {
            ...prev,
            productos: existing
              ? prev.productos.map((p) => (p.id === id ? prod : p))
              : [prod, ...prev.productos],
            inventarioSucursales: hasInv
              ? prev.inventarioSucursales.map((i) => (i.id === invId ? invEntry : i))
              : [invEntry, ...prev.inventarioSucursales],
          };
        });
      }

      notify(
        existing
          ? `Producto "${prod.nombre}" actualizado.`
          : `Producto "${prod.nombre}" agregado al inventario de ${storeName}.`
      );
    },
    [
      assertWritable,
      user,
      dataset.productos,
      dataset.inventarioSucursales,
      currentSucursal,
      effectiveSucursalId,
      notify,
    ]
  );

  const deleteProducto = useCallback(
    async (productoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar productos del inventario.');
      }
      const target = dataset.productos.find((p) => p.id === productoId);
      const relatedInvs = dataset.inventarioSucursales.filter((i) => i.productoId === productoId);

      if (user.modo === 'firebase') {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'productos', productoId));
          relatedInvs.forEach((inv) => batch.delete(doc(db, 'inventario_sucursales', inv.id)));
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `productos/${productoId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          productos: prev.productos.filter((p) => p.id !== productoId),
          inventarioSucursales: prev.inventarioSucursales.filter((i) => i.productoId !== productoId),
        }));
      }
      notify(target ? `Producto "${target.nombre}" eliminado.` : 'Producto eliminado.');
    },
    [assertWritable, user, dataset.productos, dataset.inventarioSucursales, notify]
  );

  const toggleProductoActivo = useCallback(
    async (productoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede activar o desactivar productos.');
      }
      const target = dataset.productos.find((p) => p.id === productoId);
      if (!target) return;
      const nextActivo = !target.activo;

      if (user.modo === 'firebase') {
        try {
          await updateDoc(doc(db, 'productos', productoId), {
            activo: nextActivo,
            actualizadoEn: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `productos/${productoId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          productos: prev.productos.map((p) =>
            p.id === productoId ? { ...p, activo: nextActivo } : p
          ),
        }));
      }
      notify(nextActivo ? `Producto "${target.nombre}" activado.` : `Producto "${target.nombre}" inactivo.`);
    },
    [assertWritable, user, dataset.productos, notify]
  );

  // ------------------------------------------------------------------
  // Proveedores & Compras
  // ------------------------------------------------------------------
  const saveProveedor = useCallback(
    async (input: Omit<Proveedor, 'id' | 'creadoEn'>, existingId?: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede gestionar proveedores.');
      }
      const id = existingId || makeId('prov');
      const existing = existingId
        ? dataset.proveedores.find((p) => p.id === existingId)
        : undefined;
      const prov: Proveedor = {
        id,
        nombre: input.nombre.trim().slice(0, 120),
        contacto: input.contacto.trim().slice(0, 100),
        telefono: input.telefono.trim().slice(0, 30),
        correo: input.correo.trim().slice(0, 150),
        ciudad: input.ciudad.trim().slice(0, 100),
        categorias: input.categorias.trim().slice(0, 180),
        notas: input.notas.trim().slice(0, 300),
        activo: input.activo,
        creadoEn: existing ? existing.creadoEn : new Date().toISOString(),
      };

      if (user.modo === 'firebase') {
        try {
          if (existing) {
            await updateDoc(doc(db, 'proveedores', id), {
              nombre: prov.nombre,
              contacto: prov.contacto,
              telefono: prov.telefono,
              correo: prov.correo,
              ciudad: prov.ciudad,
              categorias: prov.categorias,
              notas: prov.notas,
              activo: prov.activo,
            });
          } else {
            await setDoc(doc(db, 'proveedores', id), {
              nombre: prov.nombre,
              contacto: prov.contacto,
              telefono: prov.telefono,
              correo: prov.correo,
              ciudad: prov.ciudad,
              categorias: prov.categorias,
              notas: prov.notas,
              activo: prov.activo,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            existing ? OperationType.UPDATE : OperationType.CREATE,
            `proveedores/${id}`
          );
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          proveedores: existing
            ? prev.proveedores.map((p) => (p.id === id ? prov : p))
            : [prov, ...prev.proveedores],
        }));
      }
      notify(existing ? `Proveedor "${prov.nombre}" actualizado.` : `Proveedor "${prov.nombre}" registrado.`);
    },
    [assertWritable, user, dataset.proveedores, notify]
  );

  const deleteProveedor = useCallback(
    async (proveedorId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar proveedores.');
      }
      const target = dataset.proveedores.find((p) => p.id === proveedorId);
      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'proveedores', proveedorId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `proveedores/${proveedorId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          proveedores: prev.proveedores.filter((p) => p.id !== proveedorId),
        }));
      }
      notify(target ? `Proveedor "${target.nombre}" eliminado.` : 'Proveedor eliminado.');
    },
    [assertWritable, user, dataset.proveedores, notify]
  );

  const registrarCompraProveedor = useCallback(
    async (input: { proveedorId: string; items: CompraProveedorItem[]; notas: string }) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede registrar compras.');
      }
      if (input.items.length === 0) throw new Error('Agrega al menos un producto.');
      const compraId = makeId('oc');
      const now = new Date().toISOString();
      const totalCosto = roundMXN(input.items.reduce((acc, i) => acc + i.subtotal, 0));
      const notasLimpias = input.notas.trim().slice(0, 240);
      const storeName = currentSucursal?.nombre || 'Tienda Principal';

      if (user.modo === 'firebase') {
        let folioCreado = '';
        try {
          await runTransaction(db, async (tx) => {
            const configRef = doc(db, 'configuracion', 'tienda');
            const provRef = doc(db, 'proveedores', input.proveedorId);
            const [configSnap, provSnap] = await Promise.all([tx.get(configRef), tx.get(provRef)]);
            if (!provSnap.exists()) throw new Error('Proveedor no encontrado.');
            const prodSnaps = await Promise.all(
              input.items.map((item) => tx.get(doc(db, 'productos', item.productoId)))
            );
            const invSnaps = await Promise.all(
              input.items.map((item) =>
                tx.get(doc(db, 'inventario_sucursales', makeInvDocId(effectiveSucursalId, item.productoId)))
              )
            );
            const liveConfig = parseConfigData(
              configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : undefined
            );
            const nextCompraNum = liveConfig.consecutivoCompra + 1;
            folioCreado = padFolio('OC', nextCompraNum);
            const provNombre = String(provSnap.data().nombre || 'Proveedor');

            writeConfigInTransaction(tx, configSnap.exists(), {
              ...liveConfig,
              consecutivoCompra: nextCompraNum,
            });

            tx.set(doc(db, 'compras_proveedores', compraId), {
              folio: folioCreado,
              proveedorId: input.proveedorId,
              proveedorNombre: provNombre,
              sucursalId: effectiveSucursalId,
              items: input.items,
              totalCosto,
              notas: notasLimpias,
              registradoPorUid: user.uid,
              registradoPorNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            input.items.forEach((item, idx) => {
              const pSnap = prodSnaps[idx];
              if (!pSnap.exists()) return;
              const raw = pSnap.data();
              const stockAnterior = Number(raw.stockDisponible) || 0;
              const stockNuevo = stockAnterior + item.cantidad;
              tx.update(doc(db, 'productos', item.productoId), {
                stockDisponible: stockNuevo,
                costoUnitario: item.costoUnitario,
                actualizadoEn: serverTimestamp(),
              });

              const invId = makeInvDocId(effectiveSucursalId, item.productoId);
              const invSnap = invSnaps[idx];
              const invPrev = invSnap.exists() ? Number(invSnap.data().stockDisponible) || 0 : 0;
              const invRes = invSnap.exists() ? Number(invSnap.data().stockReservado) || 0 : 0;
              writeInvSucursalInTransaction(tx, doc(db, 'inventario_sucursales', invId), invSnap.exists(), {
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                productoId: item.productoId,
                propietarioUid: currentSucursal?.propietarioUid || user.uid,
                stockDisponible: invPrev + item.cantidad,
                stockReservado: invRes,
                stockMinimo: Number(raw.stockMinimo) || 1,
              });

              tx.set(doc(db, 'movimientos_inventario', makeId('mov')), {
                productoId: item.productoId,
                productoSku: String(raw.sku || item.sku),
                productoNombre: String(raw.nombre || item.nombre),
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                tipo: 'compra',
                cantidad: item.cantidad,
                stockAnterior: invPrev,
                stockNuevo: invPrev + item.cantidad,
                referenciaFolio: folioCreado,
                motivo: `Entrada por compra a ${provNombre}`.slice(0, 240),
                usuarioUid: user.uid,
                usuarioNombre: user.nombre,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
            });
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `compras_proveedores/${compraId}`);
        }
        notify(`Compra ${folioCreado} registrada en ${storeName}.`);
        return;
      }

      const proveedor = dataset.proveedores.find((p) => p.id === input.proveedorId);
      if (!proveedor) throw new Error('Selecciona un proveedor válido.');
      const nextCompraNum = dataset.configuracion.consecutivoCompra + 1;
      const folio = padFolio('OC', nextCompraNum);
      const nuevaCompra: CompraProveedor = {
        id: compraId,
        folio,
        proveedorId: proveedor.id,
        proveedorNombre: proveedor.nombre,
        sucursalId: effectiveSucursalId,
        items: input.items,
        totalCosto,
        notas: notasLimpias,
        registradoPorUid: user.uid,
        registradoPorNombre: user.nombre,
        creadoEn: now,
      };
      setDataset((prev) => {
        const nuevosMovs: MovimientoInventario[] = [];
        const invMap = new Map(prev.inventarioSucursales.map((i) => [i.id, i]));
        const productosActualizados = prev.productos.map((prod) => {
          const line = input.items.find((i) => i.productoId === prod.id);
          if (!line) return prod;
          const invId = makeInvDocId(effectiveSucursalId, prod.id);
          const curInv = invMap.get(invId);
          const prevDisp = curInv ? curInv.stockDisponible : 0;
          invMap.set(invId, {
            id: invId,
            sucursalId: effectiveSucursalId,
            sucursalNombre: storeName,
            productoId: prod.id,
            propietarioUid: currentSucursal?.propietarioUid || user.uid,
            stockDisponible: prevDisp + line.cantidad,
            stockReservado: curInv?.stockReservado || 0,
            stockMinimo: prod.stockMinimo,
            actualizadoEn: now,
          });
          nuevosMovs.push({
            id: makeId('mov'),
            productoId: prod.id,
            productoSku: prod.sku,
            productoNombre: prod.nombre,
            sucursalId: effectiveSucursalId,
            sucursalNombre: storeName,
            tipo: 'compra',
            cantidad: line.cantidad,
            stockAnterior: prevDisp,
            stockNuevo: prevDisp + line.cantidad,
            referenciaFolio: folio,
            motivo: `Entrada por compra a ${proveedor.nombre}`,
            usuarioUid: user.uid,
            usuarioNombre: user.nombre,
            creadoEn: now,
          });
          return {
            ...prod,
            stockDisponible: prod.stockDisponible + line.cantidad,
            costoUnitario: line.costoUnitario,
            actualizadoEn: now,
          };
        });
        return {
          ...prev,
          configuracion: { ...prev.configuracion, consecutivoCompra: nextCompraNum },
          productos: productosActualizados,
          inventarioSucursales: Array.from(invMap.values()),
          compras: [nuevaCompra, ...prev.compras],
          movimientos: [...nuevosMovs, ...prev.movimientos],
        };
      });
      notify(`Compra ${folio} registrada.`);
    },
    [assertWritable, user, currentSucursal, effectiveSucursalId, dataset.proveedores, dataset.configuracion.consecutivoCompra, notify]
  );

  // ------------------------------------------------------------------
  // Ajuste de Inventario (privado a la tienda actual del usuario o seleccionada por Admin)
  // ------------------------------------------------------------------
  const registrarAjusteInventario = useCallback(
    async (input: { productoId: string; delta: number; motivo: string; sucursalId?: string }) => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para ajustar inventario.');
      const targetSucId =
        user.rol === 'admin' && input.sucursalId ? input.sucursalId : effectiveSucursalId;
      const targetSuc = dataset.sucursales.find((s) => s.id === targetSucId) || currentSucursal;
      const storeName = targetSuc?.nombre || 'Tienda Principal';
      const motivo = input.motivo.trim().slice(0, 240) || 'Ajuste de existencias';
      const now = new Date().toISOString();
      const invId = makeInvDocId(targetSucId, input.productoId);
      const movId = makeId('mov');

      if (user.modo === 'firebase') {
        let finalOwnStock = 0;
        let prodName = '';
        try {
          await runTransaction(db, async (tx) => {
            const prodRef = doc(db, 'productos', input.productoId);
            const invRef = doc(db, 'inventario_sucursales', invId);
            const [pSnap, iSnap] = await Promise.all([tx.get(prodRef), tx.get(invRef)]);
            if (!pSnap.exists()) throw new Error('Producto no encontrado.');
            const raw = pSnap.data();
            const prevOwn = iSnap.exists() ? Number(iSnap.data().stockDisponible) || 0 : 0;
            const prevRes = iSnap.exists() ? Number(iSnap.data().stockReservado) || 0 : 0;
            const nextOwn = prevOwn + input.delta;
            if (nextOwn < 0) {
              throw new Error(`El ajuste no puede dejar el stock en ${storeName} en negativo.`);
            }
            const nextGlobal = Math.max(0, (Number(raw.stockDisponible) || 0) + input.delta);
            finalOwnStock = nextOwn;
            prodName = String(raw.nombre || '');

            tx.update(prodRef, {
              stockDisponible: nextGlobal,
              actualizadoEn: serverTimestamp(),
            });
            writeInvSucursalInTransaction(tx, invRef, iSnap.exists(), {
              sucursalId: targetSucId,
              sucursalNombre: storeName,
              productoId: input.productoId,
              propietarioUid: targetSuc?.propietarioUid || user.uid,
              stockDisponible: nextOwn,
              stockReservado: prevRes,
              stockMinimo: Number(raw.stockMinimo) || 1,
            });
            tx.set(doc(db, 'movimientos_inventario', movId), {
              productoId: input.productoId,
              productoSku: String(raw.sku || ''),
              productoNombre: prodName,
              sucursalId: targetSucId,
              sucursalNombre: storeName,
              tipo: 'ajuste',
              cantidad: input.delta,
              stockAnterior: prevOwn,
              stockNuevo: nextOwn,
              referenciaFolio: 'AJUSTE',
              motivo,
              usuarioUid: user.uid,
              usuarioNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });
          });
        } catch (err) {
          if (err instanceof Error && err.message.includes('negativo')) throw err;
          handleFirestoreError(err, OperationType.WRITE, `inventario_sucursales/${invId}`);
        }
        notify(`Stock en ${storeName} actualizado para "${prodName}": ${finalOwnStock}.`);
        return;
      }

      const prod = dataset.productos.find((p) => p.id === input.productoId);
      if (!prod) throw new Error('Producto no encontrado.');
      const curInv = dataset.inventarioSucursales.find((i) => i.id === invId);
      const prevOwn = curInv ? curInv.stockDisponible : 0;
      const nextOwn = prevOwn + input.delta;
      if (nextOwn < 0) {
        throw new Error(`El ajuste no puede dejar el stock en ${storeName} en negativo.`);
      }
      const nextInv: InventarioSucursal = {
        id: invId,
        sucursalId: targetSucId,
        sucursalNombre: storeName,
        productoId: prod.id,
        propietarioUid: targetSuc?.propietarioUid || user.uid,
        stockDisponible: nextOwn,
        stockReservado: curInv?.stockReservado || 0,
        stockMinimo: prod.stockMinimo,
        actualizadoEn: now,
      };
      const mov: MovimientoInventario = {
        id: movId,
        productoId: prod.id,
        productoSku: prod.sku,
        productoNombre: prod.nombre,
        sucursalId: targetSucId,
        sucursalNombre: storeName,
        tipo: 'ajuste',
        cantidad: input.delta,
        stockAnterior: prevOwn,
        stockNuevo: nextOwn,
        referenciaFolio: 'AJUSTE',
        motivo,
        usuarioUid: user.uid,
        usuarioNombre: user.nombre,
        creadoEn: now,
      };
      setDataset((prev) => ({
        ...prev,
        productos: prev.productos.map((p) =>
          p.id === prod.id
            ? { ...p, stockDisponible: Math.max(0, p.stockDisponible + input.delta), actualizadoEn: now }
            : p
        ),
        inventarioSucursales: curInv
          ? prev.inventarioSucursales.map((i) => (i.id === invId ? nextInv : i))
          : [nextInv, ...prev.inventarioSucursales],
        movimientos: [mov, ...prev.movimientos],
      }));
      notify(`Stock en ${storeName} actualizado para "${prod.nombre}": ${nextOwn}.`);
    },
    [assertWritable, user, effectiveSucursalId, dataset.sucursales, dataset.productos, dataset.inventarioSucursales, currentSucursal, notify]
  );

  const deleteMovimientoInventario = useCallback(
    async (movimientoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar movimientos del kardex.');
      }
      const target = dataset.movimientos.find((m) => m.id === movimientoId);
      if (!target) throw new Error('Movimiento de kardex no encontrado.');

      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'movimientos_inventario', movimientoId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `movimientos_inventario/${movimientoId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          movimientos: prev.movimientos.filter((m) => m.id !== movimientoId),
        }));
      }
      notify('Movimiento eliminado del kardex.');
    },
    [assertWritable, user, dataset.movimientos, notify]
  );

  // ------------------------------------------------------------------
  // Venta POS (descuenta de inventario privado de la tienda actual)
  // ------------------------------------------------------------------
  const procesarVentaPOS = useCallback(
    async (payload: CheckoutPayload): Promise<TicketData> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para operar el punto de venta.');
      if (payload.cart.length === 0) throw new Error('Agrega al menos un producto al carrito.');

      const now = new Date().toISOString();
      const today = todayISODate();
      const ventaId = makeId('v');
      const storeName = currentSucursal?.nombre || 'Tienda Principal';
      const storeAddress = currentSucursal?.direccion || dataset.configuracion.ubicacion;
      const encargadoTienda = currentSucursal?.encargadoNombre || '';

      if (user.modo === 'firebase') {
        let emittedTicket: TicketData | null = null;
        try {
          await runTransaction(db, async (tx) => {
            const configRef = doc(db, 'configuracion', 'tienda');
            const cliRef = doc(db, 'clientes', payload.clienteId);
            const [configSnap, cliSnap] = await Promise.all([tx.get(configRef), tx.get(cliRef)]);
            if (!cliSnap.exists()) throw new Error('El cliente seleccionado no existe.');

            const prodSnaps = await Promise.all(
              payload.cart.map((line) => tx.get(doc(db, 'productos', line.producto.id)))
            );
            const invSnaps = await Promise.all(
              payload.cart.map((line) =>
                tx.get(doc(db, 'inventario_sucursales', makeInvDocId(effectiveSucursalId, line.producto.id)))
              )
            );

            const liveConfig = parseConfigData(
              configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : undefined
            );
            const cliRaw = cliSnap.data();
            const cliNombre = String(cliRaw.nombre || '');
            const cliTel = String(cliRaw.telefono || '');
            const cliSaldoAFavor = Number(cliRaw.saldoAFavor) || 0;

            const liveCart = payload.cart.map((line, idx) => {
              const pSnap = prodSnaps[idx];
              if (!pSnap.exists()) throw new Error(`El producto "${line.producto.nombre}" ya no existe.`);
              const pRaw = pSnap.data();
              const invSnap = invSnaps[idx];
              const ownDisp = invSnap.exists()
                ? Number(invSnap.data().stockDisponible) || 0
                : Number(pRaw.stockDisponible) || 0;
              const ownRes = invSnap.exists()
                ? Number(invSnap.data().stockReservado) || 0
                : Number(pRaw.stockReservado) || 0;
              if (ownDisp < line.cantidad) {
                throw new Error(
                  `Stock insuficiente en ${storeName} para "${String(pRaw.nombre)}": quedan ${ownDisp} disponibles.`
                );
              }
              const liveProd: Producto = {
                ...line.producto,
                sku: String(pRaw.sku || line.producto.sku),
                nombre: String(pRaw.nombre || line.producto.nombre),
                precioContado: Number(pRaw.precioContado) || 0,
                precioCredito: Number(pRaw.precioCredito) || 0,
                stockDisponible: Number(pRaw.stockDisponible) || ownDisp,
                stockReservado: Number(pRaw.stockReservado) || ownRes,
              };
              return { producto: liveProd, cantidad: line.cantidad, ownDisp, ownRes, invExists: invSnap.exists() };
            });

            const calc = calculateCartTotals(
              liveCart.map((c) => ({ producto: c.producto, cantidad: c.cantidad })),
              payload.tipo,
              payload.descuento,
              payload.aplicarSaldoAFavor ? cliSaldoAFavor : 0
            );

            let pagoInicial = roundMXN(payload.pagoInicial);
            if (payload.tipo === 'contado') {
              pagoInicial = calc.total;
            } else if (pagoInicial < 0 || pagoInicial >= calc.total) {
              throw new Error(
                payload.tipo === 'credito'
                  ? 'El enganche debe ser mayor o igual a $0 y menor al total.'
                  : 'El anticipo del apartado debe ser mayor a $0 y menor al total.'
              );
            }
            if (payload.tipo === 'apartado' && pagoInicial <= 0) {
              throw new Error('Un apartado requiere un anticipo inicial mayor a $0.');
            }

            const nextVentaNum = liveConfig.consecutivoVenta + 1;
            const folioVenta = padFolio('V', nextVentaNum);
            let nextCreditoNum = liveConfig.consecutivoCredito;
            let nextApartadoNum = liveConfig.consecutivoApartado;
            let refOpId: string | undefined;
            let refFolio: string | undefined;

            if (payload.tipo === 'credito') {
              const frecuencia = payload.frecuencia || 'semanal';
              const numPagos = payload.numPagos || 12;
              const plan = calculateCreditPlan(calc.total, pagoInicial, frecuencia, numPagos, today);
              nextCreditoNum += 1;
              const creditoId = makeId('cr');
              const folioCredito = padFolio('CR', nextCreditoNum);
              refOpId = creditoId;
              refFolio = folioCredito;

              tx.set(doc(db, 'creditos', creditoId), {
                folio: folioCredito,
                ventaId,
                clienteId: payload.clienteId,
                clienteNombre: cliNombre,
                clienteTelefono: cliTel,
                sucursalId: effectiveSucursalId,
                itemsResumen: calc.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ').slice(0, 240),
                montoTotal: calc.total,
                enganche: pagoInicial,
                totalAbonado: pagoInicial,
                saldoPendiente: plan.montoFinanciado,
                frecuencia,
                numPagos,
                montoPago: plan.montoPago,
                pagosRealizados: 0,
                proximaFechaPago: plan.proximaFechaPago,
                estado: 'activo',
                vendedorUid: user.uid,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });

              emittedTicket = enrichTicket({
                tipoDocumento: 'venta_credito',
                folio: folioVenta,
                referenciaFolio: folioCredito,
                fechaISO: now,
                clienteNombre: cliNombre,
                clienteTelefono: cliTel,
                atendidoPor: user.nombre,
                metodoPago: payload.metodoPago,
                items: calc.items,
                subtotal: calc.subtotal,
                descuento: calc.descuentoAplicado,
                saldoAFavorAplicado: calc.saldoAFavorUsado,
                montoTotal: calc.total,
                pagoRecibido: pagoInicial,
                saldoPendiente: plan.montoFinanciado,
                proximoPagoFecha: plan.proximaFechaPago,
                planInfo: `${numPagos} pagos ${frecuencia === 'semanal' ? 'semanales' : frecuencia === 'quincenal' ? 'quincenales' : 'mensuales'} de ${formatMXN(plan.montoPago)}`,
              });
            } else if (payload.tipo === 'apartado') {
              nextApartadoNum += 1;
              const apartadoId = makeId('ap');
              const folioApartado = padFolio('AP', nextApartadoNum);
              const saldoPendiente = roundMXN(calc.total - pagoInicial);
              const fechaLimite = payload.fechaLimite || addDaysToISODate(today, 30);
              const condicionesLimpias = (
                payload.condiciones || 'Plazo máximo 30 días. Mercancía reservada hasta liquidación.'
              ).slice(0, 300);
              refOpId = apartadoId;
              refFolio = folioApartado;

              tx.set(doc(db, 'apartados', apartadoId), {
                folio: folioApartado,
                ventaId,
                clienteId: payload.clienteId,
                clienteNombre: cliNombre,
                clienteTelefono: cliTel,
                sucursalId: effectiveSucursalId,
                items: calc.items,
                montoTotal: calc.total,
                anticipoInicial: pagoInicial,
                totalAbonado: pagoInicial,
                saldoPendiente,
                fechaLimite,
                condiciones: condicionesLimpias,
                estado: 'vigente',
                resolucionCancelacion: 'ninguna',
                montoRetenido: 0,
                vendedorUid: user.uid,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });

              emittedTicket = enrichTicket({
                tipoDocumento: 'apartado',
                folio: folioVenta,
                referenciaFolio: folioApartado,
                fechaISO: now,
                clienteNombre: cliNombre,
                clienteTelefono: cliTel,
                atendidoPor: user.nombre,
                metodoPago: payload.metodoPago,
                items: calc.items,
                subtotal: calc.subtotal,
                descuento: calc.descuentoAplicado,
                saldoAFavorAplicado: calc.saldoAFavorUsado,
                montoTotal: calc.total,
                pagoRecibido: pagoInicial,
                saldoPendiente,
                fechaLimite,
                notas: condicionesLimpias,
              });
            } else {
              const recibido =
                payload.metodoPago === 'efectivo' &&
                payload.efectivoRecibido &&
                payload.efectivoRecibido >= calc.total
                  ? roundMXN(payload.efectivoRecibido)
                  : calc.total;
              const cambio = roundMXN(Math.max(0, recibido - calc.total));

              emittedTicket = enrichTicket({
                tipoDocumento: 'venta_contado',
                folio: folioVenta,
                fechaISO: now,
                clienteNombre: cliNombre,
                clienteTelefono: cliTel,
                atendidoPor: user.nombre,
                metodoPago: payload.metodoPago,
                items: calc.items,
                subtotal: calc.subtotal,
                descuento: calc.descuentoAplicado,
                saldoAFavorAplicado: calc.saldoAFavorUsado,
                montoTotal: calc.total,
                pagoRecibido: recibido,
                cambio,
                saldoPendiente: 0,
              });
            }

            writeConfigInTransaction(
              tx,
              configSnap.exists(),
              {
                ...liveConfig,
                consecutivoVenta: nextVentaNum,
                consecutivoCredito: nextCreditoNum,
                consecutivoApartado: nextApartadoNum,
              },
              user.rol !== 'admin'
            );

            tx.set(doc(db, 'ventas', ventaId), {
              folio: folioVenta,
              tipo: payload.tipo,
              clienteId: payload.clienteId,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              sucursalId: effectiveSucursalId,
              sucursalNombre: storeName,
              sucursalDireccion: storeAddress,
              encargadoTienda,
              items: calc.items,
              subtotal: calc.subtotal,
              descuento: calc.descuentoAplicado,
              saldoAFavorAplicado: calc.saldoAFavorUsado,
              total: calc.total,
              pagoInicial,
              metodoPago: payload.metodoPago,
              ...(refOpId ? { referenciaOperacionId: refOpId } : {}),
              ...(refFolio ? { referenciaFolio: refFolio } : {}),
              estado: payload.tipo === 'contado' ? 'completada' : 'activa',
              vendedorUid: user.uid,
              vendedorNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            if (calc.saldoAFavorUsado > 0) {
              tx.update(cliRef, {
                saldoAFavor: roundMXN(Math.max(0, cliSaldoAFavor - calc.saldoAFavorUsado)),
                actualizadoEn: serverTimestamp(),
              });
            }

            liveCart.forEach(({ producto, cantidad, ownDisp, ownRes, invExists }) => {
              const nextOwnDisp = Math.max(0, ownDisp - cantidad);
              const nextOwnRes = payload.tipo === 'apartado' ? ownRes + cantidad : ownRes;
              const nextGlobalDisp = Math.max(0, producto.stockDisponible - cantidad);
              const nextGlobalRes =
                payload.tipo === 'apartado' ? producto.stockReservado + cantidad : producto.stockReservado;

              tx.update(doc(db, 'productos', producto.id), {
                stockDisponible: nextGlobalDisp,
                stockReservado: nextGlobalRes,
                actualizadoEn: serverTimestamp(),
              });
              writeInvSucursalInTransaction(
                tx,
                doc(db, 'inventario_sucursales', makeInvDocId(effectiveSucursalId, producto.id)),
                invExists,
                {
                  sucursalId: effectiveSucursalId,
                  sucursalNombre: storeName,
                  productoId: producto.id,
                  propietarioUid: currentSucursal?.propietarioUid || user.uid,
                  stockDisponible: nextOwnDisp,
                  stockReservado: nextOwnRes,
                  stockMinimo: producto.stockMinimo,
                }
              );
              tx.set(doc(db, 'movimientos_inventario', makeId('mov')), {
                productoId: producto.id,
                productoSku: producto.sku,
                productoNombre: producto.nombre,
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                tipo: payload.tipo === 'apartado' ? 'apartado' : 'venta',
                cantidad: -cantidad,
                stockAnterior: ownDisp,
                stockNuevo: nextOwnDisp,
                referenciaFolio: refFolio || folioVenta,
                motivo:
                  payload.tipo === 'apartado'
                    ? `Reserva por apartado ${refFolio}`
                    : payload.tipo === 'credito'
                      ? `Salida por crédito ${refFolio}`
                      : `Venta contado ${folioVenta}`,
                usuarioUid: user.uid,
                usuarioNombre: user.nombre,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
            });
          });
        } catch (err) {
          if (
            err instanceof Error &&
            (err.message.includes('Stock insuficiente') ||
              err.message.includes('enganche') ||
              err.message.includes('anticipo') ||
              err.message.includes('cliente'))
          ) {
            throw err;
          }
          handleFirestoreError(err, OperationType.WRITE, `ventas/${ventaId}`);
        }
        const finalTicket = emittedTicket as TicketData | null;
        if (!finalTicket) throw new Error('No se pudo generar el comprobante.');
        setActiveTicket(finalTicket);
        notify(`Operación ${finalTicket.folio} registrada.`);
        return finalTicket;
      }

      // Local sandbox mode
      const cliente = dataset.clientes.find((c) => c.id === payload.clienteId);
      if (!cliente) throw new Error('Selecciona o registra un cliente.');
      for (const line of payload.cart) {
        const avail = getProductStoreAvailability({
          producto: line.producto,
          inventarioSucursales: dataset.inventarioSucursales,
          sucursales: dataset.sucursales,
          currentSucursalId: effectiveSucursalId,
        });
        if (avail.ownStockDisponible < line.cantidad) {
          throw new Error(
            `Stock insuficiente en ${storeName} para "${line.producto.nombre}" (${avail.statusMessage}).`
          );
        }
      }

      const calc = calculateCartTotals(
        payload.cart,
        payload.tipo,
        payload.descuento,
        payload.aplicarSaldoAFavor ? cliente.saldoAFavor : 0
      );
      let pagoInicial = roundMXN(payload.pagoInicial);
      if (payload.tipo === 'contado') pagoInicial = calc.total;
      else if (pagoInicial < 0 || pagoInicial >= calc.total) {
        throw new Error('El enganche/anticipo debe ser menor al total.');
      }
      if (payload.tipo === 'apartado' && pagoInicial <= 0) {
        throw new Error('Un apartado requiere un anticipo inicial mayor a $0.');
      }

      const nextVentaNum = dataset.configuracion.consecutivoVenta + 1;
      const folioVenta = padFolio('V', nextVentaNum);
      let nextCreditoNum = dataset.configuracion.consecutivoCredito;
      let nextApartadoNum = dataset.configuracion.consecutivoApartado;
      let nuevoCredito: Credito | null = null;
      let nuevoApartado: Apartado | null = null;
      let ticketData: TicketData;

      if (payload.tipo === 'credito') {
        const frecuencia = payload.frecuencia || 'semanal';
        const numPagos = payload.numPagos || 12;
        const plan = calculateCreditPlan(calc.total, pagoInicial, frecuencia, numPagos, today);
        nextCreditoNum += 1;
        const creditoId = makeId('cr');
        const folioCredito = padFolio('CR', nextCreditoNum);
        nuevoCredito = {
          id: creditoId,
          folio: folioCredito,
          ventaId,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          clienteTelefono: cliente.telefono,
          sucursalId: effectiveSucursalId,
          itemsResumen: calc.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ').slice(0, 240),
          montoTotal: calc.total,
          enganche: pagoInicial,
          totalAbonado: pagoInicial,
          saldoPendiente: plan.montoFinanciado,
          frecuencia,
          numPagos,
          montoPago: plan.montoPago,
          pagosRealizados: 0,
          proximaFechaPago: plan.proximaFechaPago,
          estado: 'activo',
          vendedorUid: user.uid,
          creadoEn: now,
        };
        ticketData = enrichTicket({
          tipoDocumento: 'venta_credito',
          folio: folioVenta,
          referenciaFolio: folioCredito,
          fechaISO: now,
          clienteNombre: cliente.nombre,
          clienteTelefono: cliente.telefono,
          atendidoPor: user.nombre,
          metodoPago: payload.metodoPago,
          items: calc.items,
          subtotal: calc.subtotal,
          descuento: calc.descuentoAplicado,
          saldoAFavorAplicado: calc.saldoAFavorUsado,
          montoTotal: calc.total,
          pagoRecibido: pagoInicial,
          saldoPendiente: plan.montoFinanciado,
          proximoPagoFecha: plan.proximaFechaPago,
          planInfo: `${numPagos} pagos ${frecuencia} de ${formatMXN(plan.montoPago)}`,
        });
      } else if (payload.tipo === 'apartado') {
        nextApartadoNum += 1;
        const apartadoId = makeId('ap');
        const folioApartado = padFolio('AP', nextApartadoNum);
        const saldoPendiente = roundMXN(calc.total - pagoInicial);
        const fechaLimite = payload.fechaLimite || addDaysToISODate(today, 30);
        nuevoApartado = {
          id: apartadoId,
          folio: folioApartado,
          ventaId,
          clienteId: cliente.id,
          clienteNombre: cliente.nombre,
          clienteTelefono: cliente.telefono,
          sucursalId: effectiveSucursalId,
          items: calc.items,
          montoTotal: calc.total,
          anticipoInicial: pagoInicial,
          totalAbonado: pagoInicial,
          saldoPendiente,
          fechaLimite,
          condiciones: (payload.condiciones || 'Mercancía reservada hasta liquidación.').slice(0, 300),
          estado: 'vigente',
          resolucionCancelacion: 'ninguna',
          montoRetenido: 0,
          vendedorUid: user.uid,
          creadoEn: now,
        };
        ticketData = enrichTicket({
          tipoDocumento: 'apartado',
          folio: folioVenta,
          referenciaFolio: folioApartado,
          fechaISO: now,
          clienteNombre: cliente.nombre,
          clienteTelefono: cliente.telefono,
          atendidoPor: user.nombre,
          metodoPago: payload.metodoPago,
          items: calc.items,
          subtotal: calc.subtotal,
          descuento: calc.descuentoAplicado,
          saldoAFavorAplicado: calc.saldoAFavorUsado,
          montoTotal: calc.total,
          pagoRecibido: pagoInicial,
          saldoPendiente,
          fechaLimite,
          notas: nuevoApartado.condiciones,
        });
      } else {
        const recibido =
          payload.metodoPago === 'efectivo' &&
          payload.efectivoRecibido &&
          payload.efectivoRecibido >= calc.total
            ? roundMXN(payload.efectivoRecibido)
            : calc.total;
        ticketData = enrichTicket({
          tipoDocumento: 'venta_contado',
          folio: folioVenta,
          fechaISO: now,
          clienteNombre: cliente.nombre,
          clienteTelefono: cliente.telefono,
          atendidoPor: user.nombre,
          metodoPago: payload.metodoPago,
          items: calc.items,
          subtotal: calc.subtotal,
          descuento: calc.descuentoAplicado,
          saldoAFavorAplicado: calc.saldoAFavorUsado,
          montoTotal: calc.total,
          pagoRecibido: recibido,
          cambio: roundMXN(Math.max(0, recibido - calc.total)),
          saldoPendiente: 0,
        });
      }

      const nuevaVenta: Venta = {
        id: ventaId,
        folio: folioVenta,
        tipo: payload.tipo,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        sucursalId: effectiveSucursalId,
        sucursalNombre: storeName,
        sucursalDireccion: storeAddress,
        encargadoTienda,
        items: calc.items,
        subtotal: calc.subtotal,
        descuento: calc.descuentoAplicado,
        saldoAFavorAplicado: calc.saldoAFavorUsado,
        total: calc.total,
        pagoInicial,
        metodoPago: payload.metodoPago,
        referenciaOperacionId: nuevoCredito?.id || nuevoApartado?.id,
        referenciaFolio: nuevoCredito?.folio || nuevoApartado?.folio,
        estado: payload.tipo === 'contado' ? 'completada' : 'activa',
        vendedorUid: user.uid,
        vendedorNombre: user.nombre,
        creadoEn: now,
      };

      setDataset((prev) => {
        const invMap = new Map(prev.inventarioSucursales.map((i) => [i.id, i]));
        const nuevosMovs: MovimientoInventario[] = [];
        const productosActualizados = prev.productos.map((prod) => {
          const line = payload.cart.find((c) => c.producto.id === prod.id);
          if (!line) return prod;
          const invId = makeInvDocId(effectiveSucursalId, prod.id);
          const curInv = invMap.get(invId);
          const prevDisp = curInv ? curInv.stockDisponible : prod.stockDisponible;
          const nextOwnDisp = Math.max(0, prevDisp - line.cantidad);
          const nextOwnRes =
            payload.tipo === 'apartado'
              ? (curInv?.stockReservado || 0) + line.cantidad
              : curInv?.stockReservado || 0;
          invMap.set(invId, {
            id: invId,
            sucursalId: effectiveSucursalId,
            sucursalNombre: storeName,
            productoId: prod.id,
            propietarioUid: currentSucursal?.propietarioUid || user.uid,
            stockDisponible: nextOwnDisp,
            stockReservado: nextOwnRes,
            stockMinimo: prod.stockMinimo,
            actualizadoEn: now,
          });
          nuevosMovs.push({
            id: makeId('mov'),
            productoId: prod.id,
            productoSku: prod.sku,
            productoNombre: prod.nombre,
            sucursalId: effectiveSucursalId,
            sucursalNombre: storeName,
            tipo: payload.tipo === 'apartado' ? 'apartado' : 'venta',
            cantidad: -line.cantidad,
            stockAnterior: prevDisp,
            stockNuevo: nextOwnDisp,
            referenciaFolio: nuevoCredito?.folio || nuevoApartado?.folio || folioVenta,
            motivo: `Operación ${folioVenta}`,
            usuarioUid: user.uid,
            usuarioNombre: user.nombre,
            creadoEn: now,
          });
          return {
            ...prod,
            stockDisponible: Math.max(0, prod.stockDisponible - line.cantidad),
            stockReservado:
              payload.tipo === 'apartado' ? prod.stockReservado + line.cantidad : prod.stockReservado,
            actualizadoEn: now,
          };
        });

        return {
          ...prev,
          configuracion: {
            ...prev.configuracion,
            consecutivoVenta: nextVentaNum,
            consecutivoCredito: nextCreditoNum,
            consecutivoApartado: nextApartadoNum,
          },
          productos: productosActualizados,
          inventarioSucursales: Array.from(invMap.values()),
          clientes:
            calc.saldoAFavorUsado > 0
              ? prev.clientes.map((c) =>
                  c.id === cliente.id
                    ? { ...c, saldoAFavor: roundMXN(Math.max(0, c.saldoAFavor - calc.saldoAFavorUsado)) }
                    : c
                )
              : prev.clientes,
          ventas: [nuevaVenta, ...prev.ventas],
          creditos: nuevoCredito ? [nuevoCredito, ...prev.creditos] : prev.creditos,
          apartados: nuevoApartado ? [nuevoApartado, ...prev.apartados] : prev.apartados,
          movimientos: [...nuevosMovs, ...prev.movimientos],
        };
      });

      setActiveTicket(ticketData);
      notify(`Operación ${folioVenta} registrada.`);
      return ticketData;
    },
    [
      assertWritable,
      user,
      currentSucursal,
      effectiveSucursalId,
      dataset.configuracion,
      dataset.clientes,
      dataset.inventarioSucursales,
      dataset.sucursales,
      enrichTicket,
      notify,
    ]
  );

  // ------------------------------------------------------------------
  // Créditos directos + Eliminación exclusiva de Administrador
  // ------------------------------------------------------------------
  const crearCreditoDirecto = useCallback(
    async (input: {
      clienteId: string;
      productoId?: string;
      cantidad?: number;
      descripcion: string;
      montoTotal: number;
      enganche: number;
      metodoPago: MetodoPago;
      frecuencia: FrecuenciaPago;
      numPagos: number;
      primeraFechaPago?: string;
    }): Promise<TicketData> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para registrar créditos.');
      validateCreditoInput({
        clienteId: input.clienteId,
        descripcion: input.descripcion,
        montoTotal: input.montoTotal,
        enganche: input.enganche,
        metodoPago: input.metodoPago,
        numPagos: input.numPagos,
        primeraFechaPago: input.primeraFechaPago,
      });
      const now = new Date().toISOString();
      const today = todayISODate();
      const cantidad = Math.max(1, Math.floor(input.cantidad || 1));
      const montoTotal = roundMXN(input.montoTotal);
      const enganche = roundMXN(Math.max(0, input.enganche));
      const plan = calculateCreditPlan(
        montoTotal,
        enganche,
        input.frecuencia,
        input.numPagos,
        today,
        input.primeraFechaPago
      );
      const descripcion = input.descripcion.trim().slice(0, 140);

      const ventaId = makeId('v');
      const creditoId = makeId('cr');
      const storeName = currentSucursal?.nombre || 'Tienda Principal';
      const storeAddress = currentSucursal?.direccion || dataset.configuracion.ubicacion;
      const encargadoTienda = currentSucursal?.encargadoNombre || '';

      if (user.modo === 'firebase') {
        let emittedTicket: TicketData | null = null;
        try {
          await runTransaction(db, async (tx) => {
            const configRef = doc(db, 'configuracion', 'tienda');
            const cliRef = doc(db, 'clientes', input.clienteId);
            const prodRef = input.productoId ? doc(db, 'productos', input.productoId) : null;
            const invRef = input.productoId
              ? doc(db, 'inventario_sucursales', makeInvDocId(effectiveSucursalId, input.productoId))
              : null;
            const [configSnap, cliSnap, prodSnap, invSnap] = await Promise.all([
              tx.get(configRef),
              tx.get(cliRef),
              prodRef ? tx.get(prodRef) : Promise.resolve(null),
              invRef ? tx.get(invRef) : Promise.resolve(null),
            ]);
            if (!cliSnap.exists()) throw new Error('El cliente seleccionado no existe.');
            const cliRaw = cliSnap.data();
            const cliNombre = String(cliRaw.nombre || '');
            const cliTel = String(cliRaw.telefono || '');
            const liveConfig = parseConfigData(
              configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : undefined
            );

            let items: VentaItem[];
            let ownPrev = 0;
            let prodSku = 'CREDITO';
            let prodNombre = descripcion;

            if (prodSnap && prodSnap.exists() && input.productoId) {
              const pRaw = prodSnap.data();
              ownPrev =
                invSnap && invSnap.exists()
                  ? Number(invSnap.data().stockDisponible) || 0
                  : Number(pRaw.stockDisponible) || 0;
              if (ownPrev < cantidad) {
                throw new Error(`Stock insuficiente en ${storeName}: quedan ${ownPrev} disponibles.`);
              }
              prodSku = String(pRaw.sku || 'CAT');
              prodNombre = String(pRaw.nombre || descripcion);
              items = [
                {
                  productoId: input.productoId,
                  sku: prodSku,
                  nombre: prodNombre,
                  cantidad,
                  precioUnitario: roundMXN(montoTotal / cantidad),
                  subtotal: montoTotal,
                },
              ];
            } else {
              items = [
                {
                  productoId: 'manual-credito',
                  sku: 'CREDITO',
                  nombre: descripcion,
                  cantidad,
                  precioUnitario: roundMXN(montoTotal / cantidad),
                  subtotal: montoTotal,
                },
              ];
            }

            const nextVentaNum = liveConfig.consecutivoVenta + 1;
            const nextCreditoNum = liveConfig.consecutivoCredito + 1;
            const folioVenta = padFolio('V', nextVentaNum);
            const folioCredito = padFolio('CR', nextCreditoNum);

            writeConfigInTransaction(
              tx,
              configSnap.exists(),
              { ...liveConfig, consecutivoVenta: nextVentaNum, consecutivoCredito: nextCreditoNum },
              user.rol !== 'admin'
            );

            tx.set(doc(db, 'creditos', creditoId), {
              folio: folioCredito,
              ventaId,
              clienteId: input.clienteId,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              sucursalId: effectiveSucursalId,
              itemsResumen: `${cantidad}x ${prodNombre}`.slice(0, 240),
              montoTotal,
              enganche,
              totalAbonado: enganche,
              saldoPendiente: plan.montoFinanciado,
              frecuencia: input.frecuencia,
              numPagos: input.numPagos,
              montoPago: plan.montoPago,
              pagosRealizados: 0,
              proximaFechaPago: plan.proximaFechaPago,
              recargosAcumulados: 0,
              estado: 'activo',
              vendedorUid: user.uid,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            tx.set(doc(db, 'ventas', ventaId), {
              folio: folioVenta,
              tipo: 'credito',
              clienteId: input.clienteId,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              sucursalId: effectiveSucursalId,
              sucursalNombre: storeName,
              sucursalDireccion: storeAddress,
              encargadoTienda,
              items,
              subtotal: montoTotal,
              descuento: 0,
              saldoAFavorAplicado: 0,
              total: montoTotal,
              pagoInicial: enganche,
              metodoPago: input.metodoPago,
              referenciaOperacionId: creditoId,
              referenciaFolio: folioCredito,
              estado: 'activa',
              vendedorUid: user.uid,
              vendedorNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            if (prodSnap && prodSnap.exists() && input.productoId && invRef) {
              const pRaw = prodSnap.data();
              tx.update(doc(db, 'productos', input.productoId), {
                stockDisponible: Math.max(0, (Number(pRaw.stockDisponible) || 0) - cantidad),
                actualizadoEn: serverTimestamp(),
              });
              writeInvSucursalInTransaction(tx, invRef, Boolean(invSnap && invSnap.exists()), {
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                productoId: input.productoId,
                propietarioUid: currentSucursal?.propietarioUid || user.uid,
                stockDisponible: Math.max(0, ownPrev - cantidad),
                stockReservado: invSnap && invSnap.exists() ? Number(invSnap.data().stockReservado) || 0 : 0,
                stockMinimo: Number(pRaw.stockMinimo) || 1,
              });
              tx.set(doc(db, 'movimientos_inventario', makeId('mov')), {
                productoId: input.productoId,
                productoSku: prodSku,
                productoNombre: prodNombre,
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                tipo: 'venta',
                cantidad: -cantidad,
                stockAnterior: ownPrev,
                stockNuevo: Math.max(0, ownPrev - cantidad),
                referenciaFolio: folioCredito,
                motivo: `Salida por crédito ${folioCredito}`,
                usuarioUid: user.uid,
                usuarioNombre: user.nombre,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
            }

            emittedTicket = enrichTicket({
              tipoDocumento: 'venta_credito',
              folio: folioVenta,
              referenciaFolio: folioCredito,
              fechaISO: now,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              atendidoPor: user.nombre,
              metodoPago: input.metodoPago,
              items,
              subtotal: montoTotal,
              montoTotal,
              pagoRecibido: enganche,
              saldoPendiente: plan.montoFinanciado,
              proximoPagoFecha: plan.proximaFechaPago,
              planInfo: `${input.numPagos} pagos ${input.frecuencia} de ${formatMXN(plan.montoPago)}`,
            });
          });
        } catch (err) {
          if (err instanceof Error && (err.message.includes('Stock') || err.message.includes('cliente'))) {
            throw err;
          }
          handleFirestoreError(err, OperationType.WRITE, `creditos/${creditoId}`);
        }
        const finalTicket = emittedTicket as TicketData | null;
        if (!finalTicket) throw new Error('No se pudo crear el crédito.');
        setActiveTicket(finalTicket);
        notify(`Crédito ${finalTicket.referenciaFolio} registrado.`);
        return finalTicket;
      }

      // Local sandbox
      const cliente = dataset.clientes.find((c) => c.id === input.clienteId);
      if (!cliente) throw new Error('Selecciona o registra un cliente.');
      const prod = input.productoId ? dataset.productos.find((p) => p.id === input.productoId) : undefined;
      const nextVentaNum = dataset.configuracion.consecutivoVenta + 1;
      const nextCreditoNum = dataset.configuracion.consecutivoCredito + 1;
      const folioVenta = padFolio('V', nextVentaNum);
      const folioCredito = padFolio('CR', nextCreditoNum);
      const prodNombre = prod ? prod.nombre : descripcion;
      const items: VentaItem[] = [
        {
          productoId: prod ? prod.id : 'manual-credito',
          sku: prod ? prod.sku : 'CREDITO',
          nombre: prodNombre,
          cantidad,
          precioUnitario: roundMXN(montoTotal / cantidad),
          subtotal: montoTotal,
        },
      ];

      const nuevoCredito: Credito = {
        id: creditoId,
        folio: folioCredito,
        ventaId,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        sucursalId: effectiveSucursalId,
        itemsResumen: `${cantidad}x ${prodNombre}`.slice(0, 240),
        montoTotal,
        enganche,
        totalAbonado: enganche,
        saldoPendiente: plan.montoFinanciado,
        frecuencia: input.frecuencia,
        numPagos: input.numPagos,
        montoPago: plan.montoPago,
        pagosRealizados: 0,
        proximaFechaPago: plan.proximaFechaPago,
        recargosAcumulados: 0,
        estado: 'activo',
        vendedorUid: user.uid,
        creadoEn: now,
      };
      const nuevaVenta: Venta = {
        id: ventaId,
        folio: folioVenta,
        tipo: 'credito',
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        sucursalId: effectiveSucursalId,
        sucursalNombre: storeName,
        sucursalDireccion: storeAddress,
        encargadoTienda,
        items,
        subtotal: montoTotal,
        descuento: 0,
        saldoAFavorAplicado: 0,
        total: montoTotal,
        pagoInicial: enganche,
        metodoPago: input.metodoPago,
        referenciaOperacionId: creditoId,
        referenciaFolio: folioCredito,
        estado: 'activa',
        vendedorUid: user.uid,
        vendedorNombre: user.nombre,
        creadoEn: now,
      };

      const invId = prod ? makeInvDocId(effectiveSucursalId, prod.id) : null;
      const existingInv = invId ? dataset.inventarioSucursales.find((i) => i.id === invId) : undefined;
      const ownPrev = prod
        ? existingInv
          ? existingInv.stockDisponible
          : prod.stockDisponible
        : 0;
      if (prod && ownPrev < cantidad) {
        throw new Error(`Stock insuficiente en ${storeName} para "${prod.nombre}".`);
      }

      setDataset((prev) => {
        const nextProductos = prod
          ? prev.productos.map((p) =>
              p.id === prod.id
                ? { ...p, stockDisponible: Math.max(0, p.stockDisponible - cantidad), actualizadoEn: now }
                : p
            )
          : prev.productos;
        const nextInvList =
          prod && invId
            ? prev.inventarioSucursales.some((i) => i.id === invId)
              ? prev.inventarioSucursales.map((i) =>
                  i.id === invId
                    ? { ...i, stockDisponible: Math.max(0, ownPrev - cantidad), actualizadoEn: now }
                    : i
                )
              : [
                  {
                    id: invId,
                    sucursalId: effectiveSucursalId,
                    sucursalNombre: storeName,
                    productoId: prod.id,
                    propietarioUid: currentSucursal?.propietarioUid || user.uid,
                    stockDisponible: Math.max(0, ownPrev - cantidad),
                    stockReservado: 0,
                    stockMinimo: prod.stockMinimo,
                    actualizadoEn: now,
                  },
                  ...prev.inventarioSucursales,
                ]
            : prev.inventarioSucursales;
        const nextMovimientos: MovimientoInventario[] = prod
          ? [
              {
                id: makeId('mov'),
                productoId: prod.id,
                productoSku: prod.sku,
                productoNombre: prod.nombre,
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                tipo: 'venta',
                cantidad: -cantidad,
                stockAnterior: ownPrev,
                stockNuevo: Math.max(0, ownPrev - cantidad),
                referenciaFolio: folioCredito,
                motivo: `Salida por crédito ${folioCredito}`,
                usuarioUid: user.uid,
                usuarioNombre: user.nombre,
                creadoEn: now,
              },
              ...prev.movimientos,
            ]
          : prev.movimientos;

        return {
          ...prev,
          configuracion: {
            ...prev.configuracion,
            consecutivoVenta: nextVentaNum,
            consecutivoCredito: nextCreditoNum,
          },
          productos: nextProductos,
          inventarioSucursales: nextInvList,
          movimientos: nextMovimientos,
          ventas: [nuevaVenta, ...prev.ventas],
          creditos: [nuevoCredito, ...prev.creditos],
        };
      });

      const ticket = enrichTicket({
        tipoDocumento: 'venta_credito',
        folio: folioVenta,
        referenciaFolio: folioCredito,
        fechaISO: now,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        atendidoPor: user.nombre,
        metodoPago: input.metodoPago,
        items,
        subtotal: montoTotal,
        montoTotal,
        pagoRecibido: enganche,
        saldoPendiente: plan.montoFinanciado,
        proximoPagoFecha: plan.proximaFechaPago,
        planInfo: `${input.numPagos} pagos ${input.frecuencia} de ${formatMXN(plan.montoPago)}`,
      });
      setActiveTicket(ticket);
      notify(`Crédito ${folioCredito} registrado.`);
      return ticket;
    },
    [assertWritable, user, currentSucursal, effectiveSucursalId, dataset.configuracion, dataset.clientes, dataset.productos, enrichTicket, notify]
  );

  const deleteCredito = useCallback(
    async (creditoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar cuentas de crédito.');
      }
      const target = dataset.creditos.find((c) => c.id === creditoId);
      const linkedAbonos = dataset.abonos.filter(
        (ab) => ab.tipoOperacion === 'credito' && ab.operacionId === creditoId
      );
      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'creditos', creditoId));
          for (let i = 0; i < linkedAbonos.length; i += 400) {
            const chunk = linkedAbonos.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((ab) => batch.delete(doc(db, 'abonos', ab.id)));
            await batch.commit();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `creditos/${creditoId}`);
        }
      } else {
        const linkedIds = new Set(linkedAbonos.map((ab) => ab.id));
        setDataset((prev) => ({
          ...prev,
          creditos: prev.creditos.filter((c) => c.id !== creditoId),
          abonos: prev.abonos.filter((ab) => !linkedIds.has(ab.id)),
        }));
      }
      notify(target ? `Cuenta de crédito ${target.folio} eliminada.` : 'Cuenta de crédito eliminada.');
    },
    [assertWritable, user, dataset.creditos, dataset.abonos, notify]
  );

  // ------------------------------------------------------------------
  // Apartados directos + Eliminación exclusiva de Administrador
  // ------------------------------------------------------------------
  const crearApartadoDirecto = useCallback(
    async (input: {
      clienteId: string;
      productoId?: string;
      cantidad?: number;
      descripcion: string;
      montoTotal: number;
      anticipoInicial: number;
      metodoPago: MetodoPago;
      fechaLimite: string;
      proximoPagoFecha?: string;
      condiciones: string;
    }): Promise<TicketData> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para registrar apartados.');
      const now = new Date().toISOString();
      const today = todayISODate();
      const fechaLimite = input.fechaLimite || addDaysToISODate(today, 30);
      const proximoPagoFecha = input.proximoPagoFecha || addDaysToISODate(today, 15);
      validateApartadoInput({
        clienteId: input.clienteId,
        descripcion: input.descripcion,
        montoTotal: input.montoTotal,
        anticipoInicial: input.anticipoInicial,
        metodoPago: input.metodoPago,
        fechaLimite,
        proximoPagoFecha,
      });
      const cantidad = Math.max(1, Math.floor(input.cantidad || 1));
      const montoTotal = roundMXN(input.montoTotal);
      const anticipoInicial = roundMXN(input.anticipoInicial);
      if (anticipoInicial <= 0) {
        throw new Error('El anticipo inicial debe ser mayor a $0 y menor al monto total.');
      }
      const saldoPendiente = roundMXN(montoTotal - anticipoInicial);
      const descripcion = input.descripcion.trim().slice(0, 140);
      const condiciones = (
        input.condiciones || 'Mercancía reservada hasta liquidación total.'
      ).slice(0, 300);

      const ventaId = makeId('v');
      const apartadoId = makeId('ap');
      const storeName = currentSucursal?.nombre || 'Tienda Principal';
      const storeAddress = currentSucursal?.direccion || dataset.configuracion.ubicacion;
      const encargadoTienda = currentSucursal?.encargadoNombre || '';

      if (user.modo === 'firebase') {
        let emittedTicket: TicketData | null = null;
        try {
          await runTransaction(db, async (tx) => {
            const configRef = doc(db, 'configuracion', 'tienda');
            const cliRef = doc(db, 'clientes', input.clienteId);
            const prodRef = input.productoId ? doc(db, 'productos', input.productoId) : null;
            const invRef = input.productoId
              ? doc(db, 'inventario_sucursales', makeInvDocId(effectiveSucursalId, input.productoId))
              : null;
            const [configSnap, cliSnap, prodSnap, invSnap] = await Promise.all([
              tx.get(configRef),
              tx.get(cliRef),
              prodRef ? tx.get(prodRef) : Promise.resolve(null),
              invRef ? tx.get(invRef) : Promise.resolve(null),
            ]);
            if (!cliSnap.exists()) throw new Error('El cliente seleccionado no existe.');
            const cliRaw = cliSnap.data();
            const cliNombre = String(cliRaw.nombre || '');
            const cliTel = String(cliRaw.telefono || '');
            const liveConfig = parseConfigData(
              configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : undefined
            );

            let items: VentaItem[];
            let ownPrev = 0;
            let ownRes = 0;
            let prodSku = 'APARTADO';
            let prodNombre = descripcion;

            if (prodSnap && prodSnap.exists() && input.productoId) {
              const pRaw = prodSnap.data();
              ownPrev =
                invSnap && invSnap.exists()
                  ? Number(invSnap.data().stockDisponible) || 0
                  : Number(pRaw.stockDisponible) || 0;
              ownRes =
                invSnap && invSnap.exists()
                  ? Number(invSnap.data().stockReservado) || 0
                  : Number(pRaw.stockReservado) || 0;
              if (ownPrev < cantidad) {
                throw new Error(`Stock insuficiente en ${storeName}: quedan ${ownPrev} disponibles.`);
              }
              prodSku = String(pRaw.sku || 'CAT');
              prodNombre = String(pRaw.nombre || descripcion);
              items = [
                {
                  productoId: input.productoId,
                  sku: prodSku,
                  nombre: prodNombre,
                  cantidad,
                  precioUnitario: roundMXN(montoTotal / cantidad),
                  subtotal: montoTotal,
                },
              ];
            } else {
              items = [
                {
                  productoId: 'manual-apartado',
                  sku: 'APARTADO',
                  nombre: descripcion,
                  cantidad,
                  precioUnitario: roundMXN(montoTotal / cantidad),
                  subtotal: montoTotal,
                },
              ];
            }

            const nextVentaNum = liveConfig.consecutivoVenta + 1;
            const nextApartadoNum = liveConfig.consecutivoApartado + 1;
            const folioVenta = padFolio('V', nextVentaNum);
            const folioApartado = padFolio('AP', nextApartadoNum);

            writeConfigInTransaction(
              tx,
              configSnap.exists(),
              { ...liveConfig, consecutivoVenta: nextVentaNum, consecutivoApartado: nextApartadoNum },
              user.rol !== 'admin'
            );

            tx.set(doc(db, 'apartados', apartadoId), {
              folio: folioApartado,
              ventaId,
              clienteId: input.clienteId,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              sucursalId: effectiveSucursalId,
              items,
              montoTotal,
              anticipoInicial,
              totalAbonado: anticipoInicial,
              saldoPendiente,
              fechaLimite,
              proximoPagoFecha,
              recargosAcumulados: 0,
              condiciones,
              estado: 'vigente',
              resolucionCancelacion: 'ninguna',
              montoRetenido: 0,
              vendedorUid: user.uid,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            tx.set(doc(db, 'ventas', ventaId), {
              folio: folioVenta,
              tipo: 'apartado',
              clienteId: input.clienteId,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              sucursalId: effectiveSucursalId,
              sucursalNombre: storeName,
              sucursalDireccion: storeAddress,
              encargadoTienda,
              items,
              subtotal: montoTotal,
              descuento: 0,
              saldoAFavorAplicado: 0,
              total: montoTotal,
              pagoInicial: anticipoInicial,
              metodoPago: input.metodoPago,
              referenciaOperacionId: apartadoId,
              referenciaFolio: folioApartado,
              estado: 'activa',
              vendedorUid: user.uid,
              vendedorNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            if (prodSnap && prodSnap.exists() && input.productoId && invRef) {
              const pRaw = prodSnap.data();
              tx.update(doc(db, 'productos', input.productoId), {
                stockDisponible: Math.max(0, (Number(pRaw.stockDisponible) || 0) - cantidad),
                stockReservado: (Number(pRaw.stockReservado) || 0) + cantidad,
                actualizadoEn: serverTimestamp(),
              });
              writeInvSucursalInTransaction(tx, invRef, Boolean(invSnap && invSnap.exists()), {
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                productoId: input.productoId,
                propietarioUid: currentSucursal?.propietarioUid || user.uid,
                stockDisponible: Math.max(0, ownPrev - cantidad),
                stockReservado: ownRes + cantidad,
                stockMinimo: Number(pRaw.stockMinimo) || 1,
              });
              tx.set(doc(db, 'movimientos_inventario', makeId('mov')), {
                productoId: input.productoId,
                productoSku: prodSku,
                productoNombre: prodNombre,
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                tipo: 'apartado',
                cantidad: -cantidad,
                stockAnterior: ownPrev,
                stockNuevo: Math.max(0, ownPrev - cantidad),
                referenciaFolio: folioApartado,
                motivo: `Reserva por apartado ${folioApartado}`,
                usuarioUid: user.uid,
                usuarioNombre: user.nombre,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
            }

            emittedTicket = enrichTicket({
              tipoDocumento: 'apartado',
              folio: folioVenta,
              referenciaFolio: folioApartado,
              fechaISO: now,
              clienteNombre: cliNombre,
              clienteTelefono: cliTel,
              atendidoPor: user.nombre,
              metodoPago: input.metodoPago,
              items,
              subtotal: montoTotal,
              montoTotal,
              pagoRecibido: anticipoInicial,
              saldoPendiente,
              fechaLimite,
              proximoPagoFecha,
              notas: condiciones,
            });
          });
        } catch (err) {
          if (err instanceof Error && (err.message.includes('Stock') || err.message.includes('cliente'))) {
            throw err;
          }
          handleFirestoreError(err, OperationType.WRITE, `apartados/${apartadoId}`);
        }
        const finalTicket = emittedTicket as TicketData | null;
        if (!finalTicket) throw new Error('No se pudo crear el apartado.');
        setActiveTicket(finalTicket);
        notify(`Apartado ${finalTicket.referenciaFolio} registrado.`);
        return finalTicket;
      }

      // Local sandbox
      const cliente = dataset.clientes.find((c) => c.id === input.clienteId);
      if (!cliente) throw new Error('Selecciona o registra un cliente.');
      const prod = input.productoId ? dataset.productos.find((p) => p.id === input.productoId) : undefined;
      const nextVentaNum = dataset.configuracion.consecutivoVenta + 1;
      const nextApartadoNum = dataset.configuracion.consecutivoApartado + 1;
      const folioVenta = padFolio('V', nextVentaNum);
      const folioApartado = padFolio('AP', nextApartadoNum);
      const prodNombre = prod ? prod.nombre : descripcion;
      const items: VentaItem[] = [
        {
          productoId: prod ? prod.id : 'manual-apartado',
          sku: prod ? prod.sku : 'APARTADO',
          nombre: prodNombre,
          cantidad,
          precioUnitario: roundMXN(montoTotal / cantidad),
          subtotal: montoTotal,
        },
      ];
      const nuevoApartado: Apartado = {
        id: apartadoId,
        folio: folioApartado,
        ventaId,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        sucursalId: effectiveSucursalId,
        items,
        montoTotal,
        anticipoInicial,
        totalAbonado: anticipoInicial,
        saldoPendiente,
        fechaLimite,
        proximoPagoFecha,
        recargosAcumulados: 0,
        condiciones,
        estado: 'vigente',
        resolucionCancelacion: 'ninguna',
        montoRetenido: 0,
        vendedorUid: user.uid,
        creadoEn: now,
      };
      const nuevaVenta: Venta = {
        id: ventaId,
        folio: folioVenta,
        tipo: 'apartado',
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        sucursalId: effectiveSucursalId,
        sucursalNombre: storeName,
        sucursalDireccion: storeAddress,
        encargadoTienda,
        items,
        subtotal: montoTotal,
        descuento: 0,
        saldoAFavorAplicado: 0,
        total: montoTotal,
        pagoInicial: anticipoInicial,
        metodoPago: input.metodoPago,
        referenciaOperacionId: apartadoId,
        referenciaFolio: folioApartado,
        estado: 'activa',
        vendedorUid: user.uid,
        vendedorNombre: user.nombre,
        creadoEn: now,
      };
      const invId = prod ? makeInvDocId(effectiveSucursalId, prod.id) : null;
      const existingInv = invId ? dataset.inventarioSucursales.find((i) => i.id === invId) : undefined;
      const ownPrev = prod
        ? existingInv
          ? existingInv.stockDisponible
          : prod.stockDisponible
        : 0;
      const ownRes = prod
        ? existingInv
          ? existingInv.stockReservado
          : prod.stockReservado
        : 0;
      if (prod && ownPrev < cantidad) {
        throw new Error(`Stock insuficiente en ${storeName} para "${prod.nombre}".`);
      }

      setDataset((prev) => {
        const nextProductos = prod
          ? prev.productos.map((p) =>
              p.id === prod.id
                ? {
                    ...p,
                    stockDisponible: Math.max(0, p.stockDisponible - cantidad),
                    stockReservado: p.stockReservado + cantidad,
                    actualizadoEn: now,
                  }
                : p
            )
          : prev.productos;
        const nextInvList =
          prod && invId
            ? prev.inventarioSucursales.some((i) => i.id === invId)
              ? prev.inventarioSucursales.map((i) =>
                  i.id === invId
                    ? {
                        ...i,
                        stockDisponible: Math.max(0, ownPrev - cantidad),
                        stockReservado: ownRes + cantidad,
                        actualizadoEn: now,
                      }
                    : i
                )
              : [
                  {
                    id: invId,
                    sucursalId: effectiveSucursalId,
                    sucursalNombre: storeName,
                    productoId: prod.id,
                    propietarioUid: currentSucursal?.propietarioUid || user.uid,
                    stockDisponible: Math.max(0, ownPrev - cantidad),
                    stockReservado: ownRes + cantidad,
                    stockMinimo: prod.stockMinimo,
                    actualizadoEn: now,
                  },
                  ...prev.inventarioSucursales,
                ]
            : prev.inventarioSucursales;
        const nextMovimientos: MovimientoInventario[] = prod
          ? [
              {
                id: makeId('mov'),
                productoId: prod.id,
                productoSku: prod.sku,
                productoNombre: prod.nombre,
                sucursalId: effectiveSucursalId,
                sucursalNombre: storeName,
                tipo: 'apartado',
                cantidad: -cantidad,
                stockAnterior: ownPrev,
                stockNuevo: Math.max(0, ownPrev - cantidad),
                referenciaFolio: folioApartado,
                motivo: `Reserva por apartado ${folioApartado}`,
                usuarioUid: user.uid,
                usuarioNombre: user.nombre,
                creadoEn: now,
              },
              ...prev.movimientos,
            ]
          : prev.movimientos;

        return {
          ...prev,
          configuracion: {
            ...prev.configuracion,
            consecutivoVenta: nextVentaNum,
            consecutivoApartado: nextApartadoNum,
          },
          productos: nextProductos,
          inventarioSucursales: nextInvList,
          movimientos: nextMovimientos,
          ventas: [nuevaVenta, ...prev.ventas],
          apartados: [nuevoApartado, ...prev.apartados],
        };
      });
      const ticket = enrichTicket({
        tipoDocumento: 'apartado',
        folio: folioVenta,
        referenciaFolio: folioApartado,
        fechaISO: now,
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        atendidoPor: user.nombre,
        metodoPago: input.metodoPago,
        items,
        subtotal: montoTotal,
        montoTotal,
        pagoRecibido: anticipoInicial,
        saldoPendiente,
        fechaLimite,
        proximoPagoFecha,
        notas: condiciones,
      });
      setActiveTicket(ticket);
      notify(`Apartado ${folioApartado} registrado.`);
      return ticket;
    },
    [assertWritable, user, currentSucursal, effectiveSucursalId, dataset.configuracion, dataset.clientes, dataset.productos, enrichTicket, notify]
  );

  const deleteApartado = useCallback(
    async (apartadoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar apartados.');
      }
      const target = dataset.apartados.find((a) => a.id === apartadoId);
      const linkedAbonos = dataset.abonos.filter(
        (ab) => ab.tipoOperacion === 'apartado' && ab.operacionId === apartadoId
      );
      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'apartados', apartadoId));
          for (let i = 0; i < linkedAbonos.length; i += 400) {
            const chunk = linkedAbonos.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((ab) => batch.delete(doc(db, 'abonos', ab.id)));
            await batch.commit();
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `apartados/${apartadoId}`);
        }
      } else {
        const linkedIds = new Set(linkedAbonos.map((ab) => ab.id));
        setDataset((prev) => ({
          ...prev,
          apartados: prev.apartados.filter((a) => a.id !== apartadoId),
          abonos: prev.abonos.filter((ab) => !linkedIds.has(ab.id)),
        }));
      }
      notify(target ? `Apartado ${target.folio} eliminado.` : 'Apartado eliminado.');
    },
    [assertWritable, user, dataset.apartados, dataset.abonos, notify]
  );

  const deleteAbono = useCallback(
    async (abonoId: string) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede eliminar abonos.');
      }
      const target = dataset.abonos.find((ab) => ab.id === abonoId);
      if (user.modo === 'firebase') {
        try {
          await deleteDoc(doc(db, 'abonos', abonoId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `abonos/${abonoId}`);
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          abonos: prev.abonos.filter((ab) => ab.id !== abonoId),
        }));
      }
      notify(target ? `Abono ${target.folio} eliminado.` : 'Abono eliminado.');
    },
    [assertWritable, user, dataset.abonos, notify]
  );

  const clearAbonosYCobranzaDelDia = useCallback(
    async (
      scope: 'hoy' | 'todos' = 'todos'
    ): Promise<{ abonosBorrados: number; ventasBorradas: number }> => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede borrar abonos y cobranza del día.');
      }
      const today = todayISODate();
      const abonosToDelete =
        scope === 'hoy'
          ? dataset.abonos.filter((ab) => ab.creadoEn.slice(0, 10) === today)
          : [...dataset.abonos];
      const ventasToDelete =
        scope === 'hoy'
          ? dataset.ventas.filter((v) => v.creadoEn.slice(0, 10) === today)
          : [...dataset.ventas];

      if (user.modo === 'firebase') {
        try {
          for (let i = 0; i < abonosToDelete.length; i += 400) {
            const chunk = abonosToDelete.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((ab) => batch.delete(doc(db, 'abonos', ab.id)));
            await batch.commit();
          }
          for (let i = 0; i < ventasToDelete.length; i += 400) {
            const chunk = ventasToDelete.slice(i, i + 400);
            const batch = writeBatch(db);
            chunk.forEach((v) => batch.delete(doc(db, 'ventas', v.id)));
            await batch.commit();
          }
          if (scope === 'todos') {
            try {
              await updateDoc(doc(db, 'configuracion', 'tienda'), {
                consecutivoAbono: 0,
                actualizadoEn: serverTimestamp(),
              });
            } catch {
              // Ignorar si la configuración aún no ha sido inicializada en Firestore
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'abonos');
        }
      } else {
        const deletedAbonoIds = new Set(abonosToDelete.map((ab) => ab.id));
        const deletedVentaIds = new Set(ventasToDelete.map((v) => v.id));
        setDataset((prev) => ({
          ...prev,
          abonos: prev.abonos.filter((ab) => !deletedAbonoIds.has(ab.id)),
          ventas: prev.ventas.filter((v) => !deletedVentaIds.has(v.id)),
          configuracion:
            scope === 'todos'
              ? { ...prev.configuracion, consecutivoAbono: 0 }
              : prev.configuracion,
        }));
      }

      notify(
        `Limpieza completada: ${abonosToDelete.length} abono(s) y ${ventasToDelete.length} venta(s) eliminados. Cobranza del día en $0.00.`
      );
      return {
        abonosBorrados: abonosToDelete.length,
        ventasBorradas: ventasToDelete.length,
      };
    },
    [assertWritable, user, dataset.abonos, dataset.ventas, notify]
  );

  // ------------------------------------------------------------------
  // Abonos (Crédito y Apartado) + Próxima fecha + Recargo Admin
  // ------------------------------------------------------------------
  const registrarAbonoCredito = useCallback(
    async (input: {
      creditoId: string;
      monto: number;
      metodoPago: MetodoPago;
      notas: string;
      deferTicket?: boolean;
    }): Promise<AbonoConfirmResult> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para registrar abonos.');
      validatePositiveAmount(input.monto, 'Monto del abono');
      validateMetodoPago(input.metodoPago);
      const now = new Date().toISOString();
      const today = todayISODate();
      const abonoId = makeId('ab');
      const notasLimpias = input.notas.trim().slice(0, 240);

      if (user.modo === 'firebase') {
        let ticket: TicketData | null = null;
        let liquidado = false;
        let suggestedNextDate = today;
        let overdueAlert: AlertaVencimiento | undefined;
        try {
          await runTransaction(db, async (tx) => {
            const configRef = doc(db, 'configuracion', 'tienda');
            const crRef = doc(db, 'creditos', input.creditoId);
            const [configSnap, crSnap] = await Promise.all([tx.get(configRef), tx.get(crRef)]);
            if (!crSnap.exists()) throw new Error('Crédito no encontrado.');

            const crRaw = crSnap.data();
            const liveCredito: Credito = {
              id: crSnap.id,
              folio: String(crRaw.folio),
              ventaId: String(crRaw.ventaId),
              clienteId: String(crRaw.clienteId),
              clienteNombre: String(crRaw.clienteNombre),
              clienteTelefono: String(crRaw.clienteTelefono || ''),
              sucursalId: typeof crRaw.sucursalId === 'string' ? crRaw.sucursalId : undefined,
              itemsResumen: String(crRaw.itemsResumen || ''),
              montoTotal: Number(crRaw.montoTotal),
              enganche: Number(crRaw.enganche),
              totalAbonado: Number(crRaw.totalAbonado),
              saldoPendiente: Number(crRaw.saldoPendiente),
              frecuencia: crRaw.frecuencia as FrecuenciaPago,
              numPagos: Number(crRaw.numPagos),
              montoPago: Number(crRaw.montoPago),
              pagosRealizados: Number(crRaw.pagosRealizados),
              proximaFechaPago: String(crRaw.proximaFechaPago),
              estado: crRaw.estado as Credito['estado'],
              vendedorUid: String(crRaw.vendedorUid),
              creadoEn: toISOStringSafe(crRaw.creadoEn),
            };

            const nextState = applyPaymentToCredit(liveCredito, input.monto, today);
            liquidado = nextState.estado === 'liquidado';
            suggestedNextDate = nextState.proximaFechaPago;

            const liveConfig = parseConfigData(
              configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : undefined
            );
            const nextAbonoNum = liveConfig.consecutivoAbono + 1;
            const folioAbono = padFolio('AB', nextAbonoNum);

            const ventaSnap =
              liquidado && liveCredito.ventaId
                ? await tx.get(doc(db, 'ventas', liveCredito.ventaId))
                : null;

            writeConfigInTransaction(
              tx,
              configSnap.exists(),
              { ...liveConfig, consecutivoAbono: nextAbonoNum },
              user.rol !== 'admin'
            );

            tx.update(crRef, {
              totalAbonado: nextState.totalAbonado,
              saldoPendiente: nextState.saldoPendiente,
              pagosRealizados: nextState.pagosRealizados,
              proximaFechaPago: nextState.proximaFechaPago,
              estado: nextState.estado,
              actualizadoEn: serverTimestamp(),
            });

            if (liquidado && ventaSnap && ventaSnap.exists() && ventaSnap.data().estado === 'activa') {
              tx.update(doc(db, 'ventas', liveCredito.ventaId), { estado: 'completada' });
            }

            const abonoSucursalId = (currentSucursal?.id || effectiveSucursalId).slice(0, 128);
            const abonoSucursalNombre = (currentSucursal?.nombre || 'Tienda Principal').slice(0, 100);
            const cuentaSucursalId = (liveCredito.sucursalId || '').slice(0, 128);
            const cuentaSucursalNombre = (
              dataset.sucursales.find((s) => s.id === cuentaSucursalId)?.nombre || ''
            ).slice(0, 100);
            const enOtraTienda = Boolean(
              cuentaSucursalId && abonoSucursalId && cuentaSucursalId !== abonoSucursalId
            );

            tx.set(doc(db, 'abonos', abonoId), {
              folio: folioAbono,
              tipoOperacion: 'credito',
              operacionId: liveCredito.id,
              operacionFolio: liveCredito.folio,
              clienteId: liveCredito.clienteId,
              clienteNombre: liveCredito.clienteNombre,
              clienteTelefono: liveCredito.clienteTelefono,
              monto: roundMXN(input.monto),
              saldoAnterior: liveCredito.saldoPendiente,
              saldoNuevo: nextState.saldoPendiente,
              metodoPago: input.metodoPago,
              fechaProgramada: liveCredito.proximaFechaPago,
              estadoPuntualidad: nextState.estadoPuntualidad,
              diasAtraso: nextState.diasAtraso,
              notas: notasLimpias,
              sucursalId: abonoSucursalId,
              sucursalNombre: abonoSucursalNombre,
              cuentaSucursalId,
              cuentaSucursalNombre,
              enOtraTienda,
              cobradorUid: user.uid,
              cobradorNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            if (nextState.diasAtraso > 0) {
              const alertaId = makeId('al');
              const correoDestino = liveConfig.correoAlertas || PRIMARY_ADMIN_EMAIL;
              const montoAlerta =
                nextState.saldoPendiente > 0
                  ? Math.min(liveCredito.montoPago, nextState.saldoPendiente)
                  : roundMXN(input.monto);
              tx.set(doc(db, 'alertas_vencimiento', alertaId), {
                operacionTipo: 'credito',
                operacionId: liveCredito.id,
                operacionFolio: liveCredito.folio,
                tipoAlerta: 'vencido',
                clienteId: liveCredito.clienteId,
                clienteNombre: liveCredito.clienteNombre,
                clienteTelefono: liveCredito.clienteTelefono,
                montoAPagar: montoAlerta,
                saldoPendiente: nextState.saldoPendiente,
                fechaLimite: liveCredito.proximaFechaPago,
                diasAtraso: nextState.diasAtraso,
                correoDestino,
                estado: 'pendiente',
                creadoPorUid: user.uid,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
              overdueAlert = {
                id: alertaId,
                operacionTipo: 'credito',
                operacionId: liveCredito.id,
                operacionFolio: liveCredito.folio,
                tipoAlerta: 'vencido',
                clienteId: liveCredito.clienteId,
                clienteNombre: liveCredito.clienteNombre,
                clienteTelefono: liveCredito.clienteTelefono,
                montoAPagar: montoAlerta,
                saldoPendiente: nextState.saldoPendiente,
                fechaLimite: liveCredito.proximaFechaPago,
                diasAtraso: nextState.diasAtraso,
                correoDestino,
                estado: 'pendiente',
                creadoPorUid: user.uid,
                creadoEn: now,
              };
            }

            ticket = enrichTicket({
              tipoDocumento: 'abono_credito',
              folio: folioAbono,
              referenciaFolio: liveCredito.folio,
              fechaISO: now,
              clienteNombre: liveCredito.clienteNombre,
              clienteTelefono: liveCredito.clienteTelefono,
              atendidoPor: user.nombre,
              sucursalNombre: abonoSucursalNombre,
              enOtraTienda,
              cuentaSucursalNombre: cuentaSucursalNombre || undefined,
              metodoPago: input.metodoPago,
              cuentaConcepto: liveCredito.itemsResumen || `Crédito ${liveCredito.folio}`,
              cuentaTotal: liveCredito.montoTotal,
              cuentaTotalAbonado: nextState.totalAbonado,
              cuentaEstado: liquidado ? 'Liquidado' : 'Activo',
              montoTotal: liveCredito.montoTotal,
              saldoAnterior: liveCredito.saldoPendiente,
              pagoRecibido: roundMXN(input.monto),
              saldoPendiente: nextState.saldoPendiente,
              proximoPagoFecha: liquidado ? undefined : nextState.proximaFechaPago,
              estadoPuntualidad: nextState.estadoPuntualidad,
              diasAtraso: nextState.diasAtraso,
              planInfo: liquidado
                ? 'CRÉDITO LIQUIDADO TOTALMENTE'
                : `Pago ${nextState.pagosRealizados}/${liveCredito.numPagos} (${liveCredito.frecuencia})`,
              notas: notasLimpias || undefined,
            });
          });
        } catch (err) {
          if (err instanceof Error && err.message.includes('abono')) throw err;
          handleFirestoreError(err, OperationType.WRITE, `creditos/${input.creditoId}`);
        }
        const finalTicket = ticket as TicketData | null;
        if (!finalTicket) throw new Error('No se pudo emitir el recibo.');
        if (!input.deferTicket || liquidado) setActiveTicket(finalTicket);
        notify(liquidado ? 'Crédito liquidado totalmente.' : `Abono ${finalTicket.folio} confirmado.`);
        return { ticket: finalTicket, liquidado, suggestedNextDate, overdueAlert };
      }

      // Local sandbox
      const credito = dataset.creditos.find((c) => c.id === input.creditoId);
      if (!credito) throw new Error('Crédito no encontrado.');
      const nextState = applyPaymentToCredit(credito, input.monto, today);
      const liquidado = nextState.estado === 'liquidado';
      const nextAbonoNum = dataset.configuracion.consecutivoAbono + 1;
      const folioAbono = padFolio('AB', nextAbonoNum);
      const abonoSucursalId = (currentSucursal?.id || effectiveSucursalId).slice(0, 128);
      const abonoSucursalNombre = (currentSucursal?.nombre || 'Tienda Principal').slice(0, 100);
      const cuentaSucursalId = (credito.sucursalId || '').slice(0, 128);
      const cuentaSucursalNombre = (
        dataset.sucursales.find((s) => s.id === cuentaSucursalId)?.nombre || ''
      ).slice(0, 100);
      const enOtraTienda = Boolean(
        cuentaSucursalId && abonoSucursalId && cuentaSucursalId !== abonoSucursalId
      );

      const nuevoAbono: Abono = {
        id: abonoId,
        folio: folioAbono,
        tipoOperacion: 'credito',
        operacionId: credito.id,
        operacionFolio: credito.folio,
        clienteId: credito.clienteId,
        clienteNombre: credito.clienteNombre,
        clienteTelefono: credito.clienteTelefono,
        monto: roundMXN(input.monto),
        saldoAnterior: credito.saldoPendiente,
        saldoNuevo: nextState.saldoPendiente,
        metodoPago: input.metodoPago,
        fechaProgramada: credito.proximaFechaPago,
        estadoPuntualidad: nextState.estadoPuntualidad,
        diasAtraso: nextState.diasAtraso,
        notas: notasLimpias,
        sucursalId: abonoSucursalId,
        sucursalNombre: abonoSucursalNombre,
        cuentaSucursalId,
        cuentaSucursalNombre,
        enOtraTienda,
        cobradorUid: user.uid,
        cobradorNombre: user.nombre,
        creadoEn: now,
      };
      let overdueAlert: AlertaVencimiento | undefined;
      if (nextState.diasAtraso > 0) {
        overdueAlert = {
          id: makeId('al'),
          operacionTipo: 'credito',
          operacionId: credito.id,
          operacionFolio: credito.folio,
          tipoAlerta: 'vencido',
          clienteId: credito.clienteId,
          clienteNombre: credito.clienteNombre,
          clienteTelefono: credito.clienteTelefono,
          montoAPagar:
            nextState.saldoPendiente > 0
              ? Math.min(credito.montoPago, nextState.saldoPendiente)
              : roundMXN(input.monto),
          saldoPendiente: nextState.saldoPendiente,
          fechaLimite: credito.proximaFechaPago,
          diasAtraso: nextState.diasAtraso,
          correoDestino: dataset.configuracion.correoAlertas || PRIMARY_ADMIN_EMAIL,
          estado: 'pendiente',
          creadoPorUid: user.uid,
          creadoEn: now,
        };
      }
      setDataset((prev) => ({
        ...prev,
        configuracion: { ...prev.configuracion, consecutivoAbono: nextAbonoNum },
        creditos: prev.creditos.map((c) =>
          c.id === credito.id
            ? {
                ...c,
                totalAbonado: nextState.totalAbonado,
                saldoPendiente: nextState.saldoPendiente,
                pagosRealizados: nextState.pagosRealizados,
                proximaFechaPago: nextState.proximaFechaPago,
                estado: nextState.estado,
                actualizadoEn: now,
              }
            : c
        ),
        ventas: liquidado
          ? prev.ventas.map((v) => (v.id === credito.ventaId ? { ...v, estado: 'completada' } : v))
          : prev.ventas,
        abonos: [nuevoAbono, ...prev.abonos],
        alertas: overdueAlert ? [overdueAlert, ...prev.alertas] : prev.alertas,
      }));
      const ticket = enrichTicket({
        tipoDocumento: 'abono_credito',
        folio: folioAbono,
        referenciaFolio: credito.folio,
        fechaISO: now,
        clienteNombre: credito.clienteNombre,
        clienteTelefono: credito.clienteTelefono,
        atendidoPor: user.nombre,
        sucursalNombre: abonoSucursalNombre,
        enOtraTienda,
        cuentaSucursalNombre: cuentaSucursalNombre || undefined,
        metodoPago: input.metodoPago,
        cuentaConcepto: credito.itemsResumen || `Crédito ${credito.folio}`,
        cuentaTotal: credito.montoTotal,
        cuentaTotalAbonado: nextState.totalAbonado,
        cuentaEstado: liquidado ? 'Liquidado' : 'Activo',
        montoTotal: credito.montoTotal,
        saldoAnterior: credito.saldoPendiente,
        pagoRecibido: nuevoAbono.monto,
        saldoPendiente: nextState.saldoPendiente,
        proximoPagoFecha: liquidado ? undefined : nextState.proximaFechaPago,
        estadoPuntualidad: nextState.estadoPuntualidad,
        diasAtraso: nextState.diasAtraso,
        planInfo: liquidado
          ? 'CRÉDITO LIQUIDADO TOTALMENTE'
          : `Pago ${nextState.pagosRealizados}/${credito.numPagos} (${credito.frecuencia})`,
        notas: notasLimpias || undefined,
      });
      if (!input.deferTicket || liquidado) setActiveTicket(ticket);
      notify(liquidado ? `Crédito ${credito.folio} liquidado.` : `Abono ${folioAbono} registrado.`);
      return { ticket, liquidado, suggestedNextDate: nextState.proximaFechaPago, overdueAlert };
    },
    [
      assertWritable,
      user,
      currentSucursal,
      effectiveSucursalId,
      dataset.creditos,
      dataset.sucursales,
      dataset.configuracion,
      enrichTicket,
      notify,
    ]
  );

  const registrarAbonoApartado = useCallback(
    async (input: {
      apartadoId: string;
      monto: number;
      metodoPago: MetodoPago;
      notas: string;
      deferTicket?: boolean;
    }): Promise<AbonoConfirmResult> => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para registrar abonos.');
      validatePositiveAmount(input.monto, 'Monto del abono');
      validateMetodoPago(input.metodoPago);
      const now = new Date().toISOString();
      const today = todayISODate();
      const abonoId = makeId('ab');
      const notasLimpias = input.notas.trim().slice(0, 240);

      if (user.modo === 'firebase') {
        let ticket: TicketData | null = null;
        let liquidado = false;
        let suggestedNextDate = addDaysToISODate(today, 15);
        let overdueAlert: AlertaVencimiento | undefined;
        try {
          await runTransaction(db, async (tx) => {
            const configRef = doc(db, 'configuracion', 'tienda');
            const apRef = doc(db, 'apartados', input.apartadoId);
            const [configSnap, apSnap] = await Promise.all([tx.get(configRef), tx.get(apRef)]);
            if (!apSnap.exists()) throw new Error('Apartado no encontrado.');

            const apRaw = apSnap.data();
            const liveAp: Apartado = {
              id: apSnap.id,
              folio: String(apRaw.folio),
              ventaId: String(apRaw.ventaId),
              clienteId: String(apRaw.clienteId),
              clienteNombre: String(apRaw.clienteNombre),
              clienteTelefono: String(apRaw.clienteTelefono || ''),
              sucursalId: typeof apRaw.sucursalId === 'string' ? apRaw.sucursalId : undefined,
              items: (apRaw.items || []) as Apartado['items'],
              montoTotal: Number(apRaw.montoTotal),
              anticipoInicial: Number(apRaw.anticipoInicial),
              totalAbonado: Number(apRaw.totalAbonado),
              saldoPendiente: Number(apRaw.saldoPendiente),
              fechaLimite: String(apRaw.fechaLimite),
              proximoPagoFecha:
                typeof apRaw.proximoPagoFecha === 'string' ? apRaw.proximoPagoFecha : undefined,
              condiciones: String(apRaw.condiciones || ''),
              estado: apRaw.estado as Apartado['estado'],
              resolucionCancelacion: (apRaw.resolucionCancelacion ||
                'ninguna') as ResolucionCancelacion,
              montoRetenido: Number(apRaw.montoRetenido) || 0,
              vendedorUid: String(apRaw.vendedorUid),
              creadoEn: toISOStringSafe(apRaw.creadoEn),
            };

            const nextState = applyPaymentToLayaway(liveAp, input.monto, today);
            liquidado = nextState.estado === 'liquidado';
            const autoSuggested = addDaysToISODate(today, 15);
            suggestedNextDate =
              autoSuggested <= liveAp.fechaLimite ? autoSuggested : liveAp.fechaLimite;

            const canTouchOriginProducts =
              user.rol === 'admin' || !liveAp.sucursalId || liveAp.sucursalId === effectiveSucursalId;
            const originSucId = liveAp.sucursalId || effectiveSucursalId;
            const catalogItems = liveAp.items.filter(
              (item) => item.productoId && !item.productoId.startsWith('manual-')
            );
            const prodSnaps =
              liquidado && canTouchOriginProducts
                ? await Promise.all(
                    catalogItems.map((item) => tx.get(doc(db, 'productos', item.productoId)))
                  )
                : [];
            const invSnaps =
              liquidado && canTouchOriginProducts
                ? await Promise.all(
                    catalogItems.map((item) =>
                      tx.get(doc(db, 'inventario_sucursales', makeInvDocId(originSucId, item.productoId)))
                    )
                  )
                : [];
            const ventaSnap =
              liquidado && liveAp.ventaId
                ? await tx.get(doc(db, 'ventas', liveAp.ventaId))
                : null;

            const liveConfig = parseConfigData(
              configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : undefined
            );
            const nextAbonoNum = liveConfig.consecutivoAbono + 1;
            const folioAbono = padFolio('AB', nextAbonoNum);
            const fechaProgramada = liveAp.proximoPagoFecha || liveAp.fechaLimite;
            const abonoSucursalId = (currentSucursal?.id || effectiveSucursalId).slice(0, 128);
            const abonoSucursalNombre = (currentSucursal?.nombre || 'Tienda Principal').slice(0, 100);
            const cuentaSucursalId = (liveAp.sucursalId || '').slice(0, 128);
            const cuentaSucursalNombre = (
              dataset.sucursales.find((s) => s.id === cuentaSucursalId)?.nombre || ''
            ).slice(0, 100);
            const enOtraTienda = Boolean(
              cuentaSucursalId && abonoSucursalId && cuentaSucursalId !== abonoSucursalId
            );

            writeConfigInTransaction(
              tx,
              configSnap.exists(),
              { ...liveConfig, consecutivoAbono: nextAbonoNum },
              user.rol !== 'admin'
            );

            tx.update(apRef, {
              totalAbonado: nextState.totalAbonado,
              saldoPendiente: nextState.saldoPendiente,
              proximoPagoFecha: liquidado ? liveAp.fechaLimite : suggestedNextDate,
              estado: nextState.estado,
              actualizadoEn: serverTimestamp(),
            });

            tx.set(doc(db, 'abonos', abonoId), {
              folio: folioAbono,
              tipoOperacion: 'apartado',
              operacionId: liveAp.id,
              operacionFolio: liveAp.folio,
              clienteId: liveAp.clienteId,
              clienteNombre: liveAp.clienteNombre,
              clienteTelefono: liveAp.clienteTelefono,
              monto: roundMXN(input.monto),
              saldoAnterior: liveAp.saldoPendiente,
              saldoNuevo: nextState.saldoPendiente,
              metodoPago: input.metodoPago,
              fechaProgramada,
              estadoPuntualidad: nextState.estadoPuntualidad,
              diasAtraso: nextState.diasAtraso,
              notas: notasLimpias,
              sucursalId: abonoSucursalId,
              sucursalNombre: abonoSucursalNombre,
              cuentaSucursalId,
              cuentaSucursalNombre,
              enOtraTienda,
              cobradorUid: user.uid,
              cobradorNombre: user.nombre,
              tiendaId: TIENDA_ID,
              creadoEn: serverTimestamp(),
            });

            if (nextState.diasAtraso > 0) {
              const alertaId = makeId('al');
              const correoDestino = liveConfig.correoAlertas || PRIMARY_ADMIN_EMAIL;
              const montoAlerta =
                nextState.saldoPendiente > 0 ? nextState.saldoPendiente : roundMXN(input.monto);
              tx.set(doc(db, 'alertas_vencimiento', alertaId), {
                operacionTipo: 'apartado',
                operacionId: liveAp.id,
                operacionFolio: liveAp.folio,
                tipoAlerta: 'vencido',
                clienteId: liveAp.clienteId,
                clienteNombre: liveAp.clienteNombre,
                clienteTelefono: liveAp.clienteTelefono,
                montoAPagar: montoAlerta,
                saldoPendiente: nextState.saldoPendiente,
                fechaLimite: fechaProgramada,
                diasAtraso: nextState.diasAtraso,
                correoDestino,
                estado: 'pendiente',
                creadoPorUid: user.uid,
                tiendaId: TIENDA_ID,
                creadoEn: serverTimestamp(),
              });
              overdueAlert = {
                id: alertaId,
                operacionTipo: 'apartado',
                operacionId: liveAp.id,
                operacionFolio: liveAp.folio,
                tipoAlerta: 'vencido',
                clienteId: liveAp.clienteId,
                clienteNombre: liveAp.clienteNombre,
                clienteTelefono: liveAp.clienteTelefono,
                montoAPagar: montoAlerta,
                saldoPendiente: nextState.saldoPendiente,
                fechaLimite: fechaProgramada,
                diasAtraso: nextState.diasAtraso,
                correoDestino,
                estado: 'pendiente',
                creadoPorUid: user.uid,
                creadoEn: now,
              };
            }

            if (liquidado) {
              if (ventaSnap && ventaSnap.exists() && ventaSnap.data().estado === 'activa') {
                tx.update(doc(db, 'ventas', liveAp.ventaId), { estado: 'completada' });
              }
              catalogItems.forEach((item, idx) => {
                const pSnap = prodSnaps[idx];
                if (pSnap && pSnap.exists()) {
                  tx.update(doc(db, 'productos', item.productoId), {
                    stockReservado: Math.max(0, (Number(pSnap.data().stockReservado) || 0) - item.cantidad),
                    actualizadoEn: serverTimestamp(),
                  });
                }
                const iSnap = invSnaps[idx];
                if (iSnap && iSnap.exists()) {
                  tx.update(doc(db, 'inventario_sucursales', makeInvDocId(originSucId, item.productoId)), {
                    stockReservado: Math.max(0, (Number(iSnap.data().stockReservado) || 0) - item.cantidad),
                    actualizadoEn: serverTimestamp(),
                  });
                }
              });
            }

            ticket = enrichTicket({
              tipoDocumento: liquidado ? 'liquidacion_apartado' : 'abono_apartado',
              folio: folioAbono,
              referenciaFolio: liveAp.folio,
              fechaISO: now,
              clienteNombre: liveAp.clienteNombre,
              clienteTelefono: liveAp.clienteTelefono,
              atendidoPor: user.nombre,
              sucursalNombre: abonoSucursalNombre,
              enOtraTienda,
              cuentaSucursalNombre: cuentaSucursalNombre || undefined,
              metodoPago: input.metodoPago,
              items: liveAp.items && liveAp.items.length > 0 ? liveAp.items : undefined,
              cuentaConcepto:
                liveAp.items && liveAp.items.length > 0
                  ? liveAp.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')
                  : `Apartado ${liveAp.folio}`,
              cuentaTotal: liveAp.montoTotal,
              cuentaTotalAbonado: nextState.totalAbonado,
              cuentaEstado: liquidado ? 'Liquidado' : 'Vigente',
              montoTotal: liveAp.montoTotal,
              saldoAnterior: liveAp.saldoPendiente,
              pagoRecibido: roundMXN(input.monto),
              saldoPendiente: nextState.saldoPendiente,
              fechaLimite: liquidado ? undefined : liveAp.fechaLimite,
              proximoPagoFecha: liquidado ? undefined : suggestedNextDate,
              estadoPuntualidad: nextState.estadoPuntualidad,
              diasAtraso: nextState.diasAtraso,
              planInfo: liquidado
                ? 'APARTADO LIQUIDADO TOTALMENTE'
                : liveAp.condiciones || 'Plan de apartado vigente',
              notas: liquidado ? 'APARTADO LIQUIDADO — MERCANCÍA LISTA PARA ENTREGA' : notasLimpias || undefined,
            });
          });
        } catch (err) {
          if (err instanceof Error && err.message.includes('abono')) throw err;
          handleFirestoreError(err, OperationType.WRITE, `apartados/${input.apartadoId}`);
        }
        const finalTicket = ticket as TicketData | null;
        if (!finalTicket) throw new Error('No se pudo emitir el recibo.');
        if (!input.deferTicket || liquidado) setActiveTicket(finalTicket);
        notify(liquidado ? 'Apartado liquidado.' : `Abono ${finalTicket.folio} confirmado.`);
        return { ticket: finalTicket, liquidado, suggestedNextDate, overdueAlert };
      }

      // Local sandbox
      const apartado = dataset.apartados.find((a) => a.id === input.apartadoId);
      if (!apartado) throw new Error('Apartado no encontrado.');
      const nextState = applyPaymentToLayaway(apartado, input.monto, today);
      const liquidado = nextState.estado === 'liquidado';
      const autoSuggested = addDaysToISODate(today, 15);
      const suggestedNextDate =
        autoSuggested <= apartado.fechaLimite ? autoSuggested : apartado.fechaLimite;
      const nextAbonoNum = dataset.configuracion.consecutivoAbono + 1;
      const folioAbono = padFolio('AB', nextAbonoNum);
      const fechaProgramada = apartado.proximoPagoFecha || apartado.fechaLimite;
      const abonoSucursalId = (currentSucursal?.id || effectiveSucursalId).slice(0, 128);
      const abonoSucursalNombre = (currentSucursal?.nombre || 'Tienda Principal').slice(0, 100);
      const cuentaSucursalId = (apartado.sucursalId || '').slice(0, 128);
      const cuentaSucursalNombre = (
        dataset.sucursales.find((s) => s.id === cuentaSucursalId)?.nombre || ''
      ).slice(0, 100);
      const enOtraTienda = Boolean(
        cuentaSucursalId && abonoSucursalId && cuentaSucursalId !== abonoSucursalId
      );

      const nuevoAbono: Abono = {
        id: abonoId,
        folio: folioAbono,
        tipoOperacion: 'apartado',
        operacionId: apartado.id,
        operacionFolio: apartado.folio,
        clienteId: apartado.clienteId,
        clienteNombre: apartado.clienteNombre,
        clienteTelefono: apartado.clienteTelefono,
        monto: roundMXN(input.monto),
        saldoAnterior: apartado.saldoPendiente,
        saldoNuevo: nextState.saldoPendiente,
        metodoPago: input.metodoPago,
        fechaProgramada,
        estadoPuntualidad: nextState.estadoPuntualidad,
        diasAtraso: nextState.diasAtraso,
        notas: notasLimpias,
        sucursalId: abonoSucursalId,
        sucursalNombre: abonoSucursalNombre,
        cuentaSucursalId,
        cuentaSucursalNombre,
        enOtraTienda,
        cobradorUid: user.uid,
        cobradorNombre: user.nombre,
        creadoEn: now,
      };
      const originSucId = apartado.sucursalId || effectiveSucursalId;
      const catalogItems = apartado.items.filter(
        (item) => item.productoId && !item.productoId.startsWith('manual-')
      );
      setDataset((prev) => ({
        ...prev,
        configuracion: { ...prev.configuracion, consecutivoAbono: nextAbonoNum },
        apartados: prev.apartados.map((a) =>
          a.id === apartado.id
            ? {
                ...a,
                totalAbonado: nextState.totalAbonado,
                saldoPendiente: nextState.saldoPendiente,
                proximoPagoFecha: liquidado ? a.fechaLimite : suggestedNextDate,
                estado: nextState.estado,
                actualizadoEn: now,
              }
            : a
        ),
        ventas: liquidado
          ? prev.ventas.map((v) => (v.id === apartado.ventaId ? { ...v, estado: 'completada' } : v))
          : prev.ventas,
        productos: liquidado
          ? prev.productos.map((p) => {
              const matched = catalogItems.find((i) => i.productoId === p.id);
              return matched
                ? { ...p, stockReservado: Math.max(0, p.stockReservado - matched.cantidad), actualizadoEn: now }
                : p;
            })
          : prev.productos,
        inventarioSucursales: liquidado
          ? prev.inventarioSucursales.map((inv) => {
              if (inv.sucursalId !== originSucId) return inv;
              const matched = catalogItems.find((i) => i.productoId === inv.productoId);
              return matched
                ? { ...inv, stockReservado: Math.max(0, inv.stockReservado - matched.cantidad), actualizadoEn: now }
                : inv;
            })
          : prev.inventarioSucursales,
        abonos: [nuevoAbono, ...prev.abonos],
      }));
      const ticket = enrichTicket({
        tipoDocumento: liquidado ? 'liquidacion_apartado' : 'abono_apartado',
        folio: folioAbono,
        referenciaFolio: apartado.folio,
        fechaISO: now,
        clienteNombre: apartado.clienteNombre,
        clienteTelefono: apartado.clienteTelefono,
        atendidoPor: user.nombre,
        sucursalNombre: abonoSucursalNombre,
        enOtraTienda,
        cuentaSucursalNombre: cuentaSucursalNombre || undefined,
        metodoPago: input.metodoPago,
        items: apartado.items && apartado.items.length > 0 ? apartado.items : undefined,
        cuentaConcepto:
          apartado.items && apartado.items.length > 0
            ? apartado.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')
            : `Apartado ${apartado.folio}`,
        cuentaTotal: apartado.montoTotal,
        cuentaTotalAbonado: nextState.totalAbonado,
        cuentaEstado: liquidado ? 'Liquidado' : 'Vigente',
        montoTotal: apartado.montoTotal,
        saldoAnterior: apartado.saldoPendiente,
        pagoRecibido: nuevoAbono.monto,
        saldoPendiente: nextState.saldoPendiente,
        fechaLimite: liquidado ? undefined : apartado.fechaLimite,
        proximoPagoFecha: liquidado ? undefined : suggestedNextDate,
        estadoPuntualidad: nextState.estadoPuntualidad,
        diasAtraso: nextState.diasAtraso,
        planInfo: liquidado
          ? 'APARTADO LIQUIDADO TOTALMENTE'
          : apartado.condiciones || 'Plan de apartado vigente',
        notas: liquidado ? 'APARTADO LIQUIDADO — MERCANCÍA LISTA PARA ENTREGA' : notasLimpias || undefined,
      });
      if (!input.deferTicket || liquidado) setActiveTicket(ticket);
      notify(liquidado ? `Apartado ${apartado.folio} liquidado.` : `Abono ${folioAbono} registrado.`);
      return { ticket, liquidado, suggestedNextDate };
    },
    [
      assertWritable,
      user,
      currentSucursal,
      effectiveSucursalId,
      dataset.apartados,
      dataset.sucursales,
      dataset.configuracion,
      enrichTicket,
      notify,
    ]
  );

  const actualizarProximaFechaPago = useCallback(
    async (input: {
      tipo: 'credito' | 'apartado';
      operacionId: string;
      nuevaFecha: string;
      actualizarFechaLimite?: boolean;
    }) => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para actualizar fechas.');
      const cleanDate = input.nuevaFecha.trim().slice(0, 10);
      if (cleanDate.length !== 10) throw new Error('Selecciona una fecha válida.');
      const now = new Date().toISOString();

      if (user.modo === 'firebase') {
        try {
          if (input.tipo === 'credito') {
            await updateDoc(doc(db, 'creditos', input.operacionId), {
              proximaFechaPago: cleanDate,
              actualizadoEn: serverTimestamp(),
            });
          } else {
            await updateDoc(doc(db, 'apartados', input.operacionId), {
              proximoPagoFecha: cleanDate,
              ...(input.actualizarFechaLimite ? { fechaLimite: cleanDate } : {}),
              actualizadoEn: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.UPDATE,
            `${input.tipo === 'credito' ? 'creditos' : 'apartados'}/${input.operacionId}`
          );
        }
      } else {
        setDataset((prev) => ({
          ...prev,
          creditos:
            input.tipo === 'credito'
              ? prev.creditos.map((c) =>
                  c.id === input.operacionId ? { ...c, proximaFechaPago: cleanDate, actualizadoEn: now } : c
                )
              : prev.creditos,
          apartados:
            input.tipo === 'apartado'
              ? prev.apartados.map((a) =>
                  a.id === input.operacionId
                    ? {
                        ...a,
                        proximoPagoFecha: cleanDate,
                        ...(input.actualizarFechaLimite ? { fechaLimite: cleanDate } : {}),
                        actualizadoEn: now,
                      }
                    : a
                )
              : prev.apartados,
        }));
      }
      notify(`Próximo pago programado para ${cleanDate}.`);
    },
    [assertWritable, user, notify]
  );

  const aumentarPagoUsuarioAtrasado = useCallback(
    async (input: {
      tipo: 'credito' | 'apartado';
      operacionId: string;
      incrementoSaldo: number;
      nuevoMontoPago?: number;
      motivo: string;
    }) => {
      assertWritable();
      if (!user || user.rol !== 'admin') {
        throw new Error('Solo el Administrador puede aumentar pagos de usuarios atrasados.');
      }
      const motivoLimpio = input.motivo.trim().slice(0, 240);
      if (motivoLimpio.length < 3) {
        throw new Error('Escribe el motivo del incremento o recargo por atraso.');
      }
      const now = new Date().toISOString();

      if (user.modo === 'firebase') {
        try {
          await runTransaction(db, async (tx) => {
            if (input.tipo === 'credito') {
              const ref = doc(db, 'creditos', input.operacionId);
              const snap = await tx.get(ref);
              if (!snap.exists()) throw new Error('Crédito no encontrado.');
              const raw = snap.data();
              const res = applyAdminOverdueIncrease({
                montoTotalActual: Number(raw.montoTotal) || 0,
                saldoPendienteActual: Number(raw.saldoPendiente) || 0,
                montoPagoActual: Number(raw.montoPago) || 0,
                recargosActuales: Number(raw.recargosAcumulados) || 0,
                incrementoSaldo: input.incrementoSaldo,
                nuevoMontoPago: input.nuevoMontoPago,
              });
              tx.update(ref, {
                montoTotal: res.montoTotal,
                saldoPendiente: res.saldoPendiente,
                montoPago: res.montoPago ?? Number(raw.montoPago),
                recargosAcumulados: res.recargosAcumulados,
                ultimoMotivoIncremento: motivoLimpio,
                actualizadoEn: serverTimestamp(),
              });
            } else {
              const ref = doc(db, 'apartados', input.operacionId);
              const snap = await tx.get(ref);
              if (!snap.exists()) throw new Error('Apartado no encontrado.');
              const raw = snap.data();
              const res = applyAdminOverdueIncrease({
                montoTotalActual: Number(raw.montoTotal) || 0,
                saldoPendienteActual: Number(raw.saldoPendiente) || 0,
                recargosActuales: Number(raw.recargosAcumulados) || 0,
                incrementoSaldo: input.incrementoSaldo,
              });
              tx.update(ref, {
                montoTotal: res.montoTotal,
                saldoPendiente: res.saldoPendiente,
                recargosAcumulados: res.recargosAcumulados,
                ultimoMotivoIncremento: motivoLimpio,
                actualizadoEn: serverTimestamp(),
              });
            }
          });
        } catch (err) {
          if (err instanceof Error && (err.message.includes('aumento') || err.message.includes('Indica'))) {
            throw err;
          }
          handleFirestoreError(
            err,
            OperationType.UPDATE,
            `${input.tipo === 'credito' ? 'creditos' : 'apartados'}/${input.operacionId}`
          );
        }
        notify('Aumento por atraso aplicado (Administrador).');
        return;
      }

      if (input.tipo === 'credito') {
        const target = dataset.creditos.find((c) => c.id === input.operacionId);
        if (!target) throw new Error('Crédito no encontrado.');
        const res = applyAdminOverdueIncrease({
          montoTotalActual: target.montoTotal,
          saldoPendienteActual: target.saldoPendiente,
          montoPagoActual: target.montoPago,
          recargosActuales: target.recargosAcumulados || 0,
          incrementoSaldo: input.incrementoSaldo,
          nuevoMontoPago: input.nuevoMontoPago,
        });
        setDataset((prev) => ({
          ...prev,
          creditos: prev.creditos.map((c) =>
            c.id === target.id
              ? {
                  ...c,
                  montoTotal: res.montoTotal,
                  saldoPendiente: res.saldoPendiente,
                  montoPago: res.montoPago ?? c.montoPago,
                  recargosAcumulados: res.recargosAcumulados,
                  ultimoMotivoIncremento: motivoLimpio,
                  actualizadoEn: now,
                }
              : c
          ),
        }));
      } else {
        const target = dataset.apartados.find((a) => a.id === input.operacionId);
        if (!target) throw new Error('Apartado no encontrado.');
        const res = applyAdminOverdueIncrease({
          montoTotalActual: target.montoTotal,
          saldoPendienteActual: target.saldoPendiente,
          recargosActuales: target.recargosAcumulados || 0,
          incrementoSaldo: input.incrementoSaldo,
        });
        setDataset((prev) => ({
          ...prev,
          apartados: prev.apartados.map((a) =>
            a.id === target.id
              ? {
                  ...a,
                  montoTotal: res.montoTotal,
                  saldoPendiente: res.saldoPendiente,
                  recargosAcumulados: res.recargosAcumulados,
                  ultimoMotivoIncremento: motivoLimpio,
                  actualizadoEn: now,
                }
              : a
          ),
        }));
      }
      notify('Aumento por atraso aplicado (Administrador).');
    },
    [assertWritable, user, dataset.creditos, dataset.apartados, notify]
  );

  const registrarAlertaEnviada = useCallback(
    async (input: {
      alertaId?: string;
      operacionTipo: 'credito' | 'apartado';
      operacionId: string;
      operacionFolio: string;
      clienteId: string;
      clienteNombre: string;
      clienteTelefono: string;
      montoAPagar: number;
      fechaLimite: string;
      diasAtraso: number;
      correoDestino: string;
    }) => {
      assertWritable();
      if (!user) return;
      const now = new Date().toISOString();
      const correoLimpio = (input.correoDestino || dataset.configuracion.correoAlertas || PRIMARY_ADMIN_EMAIL)
        .trim()
        .slice(0, 150);

      if (input.alertaId) {
        if (user.modo === 'firebase') {
          try {
            await updateDoc(doc(db, 'alertas_vencimiento', input.alertaId), {
              estado: 'enviada',
              correoDestino: correoLimpio,
              metodoEnvio: 'mailto',
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `alertas_vencimiento/${input.alertaId}`);
          }
        } else {
          setDataset((prev) => ({
            ...prev,
            alertas: prev.alertas.map((a) =>
              a.id === input.alertaId
                ? { ...a, estado: 'enviada', correoDestino: correoLimpio, metodoEnvio: 'mailto' }
                : a
            ),
          }));
        }
        notify(`Alerta de ${input.clienteNombre} marcada como enviada.`);
        return;
      }

      const id = makeId('al');
      const nuevaAlerta: AlertaVencimiento = {
        id,
        operacionTipo: input.operacionTipo,
        operacionId: input.operacionId,
        operacionFolio: input.operacionFolio,
        tipoAlerta: 'vencido',
        clienteId: input.clienteId,
        clienteNombre: input.clienteNombre,
        clienteTelefono: input.clienteTelefono,
        montoAPagar: roundMXN(input.montoAPagar),
        fechaLimite: input.fechaLimite,
        diasAtraso: Math.max(0, Math.floor(input.diasAtraso)),
        correoDestino: correoLimpio,
        metodoEnvio: 'mailto',
        estado: 'enviada',
        creadoPorUid: user.uid,
        creadoEn: now,
      };

      if (user.modo === 'firebase') {
        try {
          await setDoc(doc(db, 'alertas_vencimiento', id), {
            operacionTipo: nuevaAlerta.operacionTipo,
            operacionId: nuevaAlerta.operacionId,
            operacionFolio: nuevaAlerta.operacionFolio,
            tipoAlerta: 'vencido',
            clienteId: nuevaAlerta.clienteId,
            clienteNombre: nuevaAlerta.clienteNombre,
            clienteTelefono: nuevaAlerta.clienteTelefono,
            montoAPagar: nuevaAlerta.montoAPagar,
            fechaLimite: nuevaAlerta.fechaLimite,
            diasAtraso: nuevaAlerta.diasAtraso,
            correoDestino: nuevaAlerta.correoDestino,
            metodoEnvio: 'mailto',
            estado: 'enviada',
            creadoPorUid: user.uid,
            tiendaId: TIENDA_ID,
            creadoEn: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `alertas_vencimiento/${id}`);
        }
      } else {
        setDataset((prev) => ({ ...prev, alertas: [nuevaAlerta, ...prev.alertas] }));
      }
      notify(`Alerta enviada a ${correoLimpio}.`);
    },
    [assertWritable, user, dataset.configuracion.correoAlertas, notify]
  );

  const cancelarApartado = useCallback(
    async (input: {
      apartadoId: string;
      resolucion: Exclude<ResolucionCancelacion, 'ninguna'>;
      montoPenalizacion: number;
      motivo: string;
    }) => {
      assertWritable();
      if (!user) throw new Error('Inicia sesión para cancelar apartados.');
      const motivoLimpio = input.motivo.trim().slice(0, 240) || 'Cancelación en mostrador';
      const now = new Date().toISOString();

      if (user.modo === 'firebase') {
        let folioCancelado = '';
        try {
          await runTransaction(db, async (tx) => {
            const apRef = doc(db, 'apartados', input.apartadoId);
            const apSnap = await tx.get(apRef);
            if (!apSnap.exists()) throw new Error('Apartado no encontrado.');
            const apRaw = apSnap.data();
            const liveAp: Apartado = {
              id: apSnap.id,
              folio: String(apRaw.folio),
              ventaId: String(apRaw.ventaId),
              clienteId: String(apRaw.clienteId),
              clienteNombre: String(apRaw.clienteNombre),
              clienteTelefono: String(apRaw.clienteTelefono || ''),
              sucursalId: typeof apRaw.sucursalId === 'string' ? apRaw.sucursalId : undefined,
              items: (apRaw.items || []) as Apartado['items'],
              montoTotal: Number(apRaw.montoTotal),
              anticipoInicial: Number(apRaw.anticipoInicial),
              totalAbonado: Number(apRaw.totalAbonado),
              saldoPendiente: Number(apRaw.saldoPendiente),
              fechaLimite: String(apRaw.fechaLimite),
              condiciones: String(apRaw.condiciones || ''),
              estado: apRaw.estado as Apartado['estado'],
              resolucionCancelacion: (apRaw.resolucionCancelacion ||
                'ninguna') as ResolucionCancelacion,
              montoRetenido: Number(apRaw.montoRetenido) || 0,
              vendedorUid: String(apRaw.vendedorUid),
              creadoEn: toISOStringSafe(apRaw.creadoEn),
            };
            const outcome = resolveLayawayCancellation(
              liveAp,
              input.resolucion,
              input.montoPenalizacion
            );
            folioCancelado = liveAp.folio;

            const originSucId = liveAp.sucursalId || effectiveSucursalId;
            const originSucName =
              dataset.sucursales.find((s) => s.id === originSucId)?.nombre ||
              currentSucursal?.nombre ||
              'Tienda Principal';
            const canTouchOriginProducts =
              user.rol === 'admin' || !liveAp.sucursalId || liveAp.sucursalId === effectiveSucursalId;
            const catalogRestoreItems = outcome.stockARestaurar.filter(
              (item) => item.productoId && !item.productoId.startsWith('manual-')
            );

            const [cliSnap, ventaSnap] = await Promise.all([
              tx.get(doc(db, 'clientes', liveAp.clienteId)),
              liveAp.ventaId ? tx.get(doc(db, 'ventas', liveAp.ventaId)) : Promise.resolve(null),
            ]);
            const prodSnaps = canTouchOriginProducts
              ? await Promise.all(
                  catalogRestoreItems.map((item) => tx.get(doc(db, 'productos', item.productoId)))
                )
              : [];
            const invSnaps = canTouchOriginProducts
              ? await Promise.all(
                  catalogRestoreItems.map((item) =>
                    tx.get(doc(db, 'inventario_sucursales', makeInvDocId(originSucId, item.productoId)))
                  )
                )
              : [];

            tx.update(apRef, {
              estado: 'cancelado',
              resolucionCancelacion: outcome.resolucion,
              montoRetenido: outcome.montoRetenido,
              motivoCancelacion: motivoLimpio,
              actualizadoEn: serverTimestamp(),
            });
            if (ventaSnap && ventaSnap.exists() && ventaSnap.data().estado === 'activa') {
              tx.update(doc(db, 'ventas', liveAp.ventaId), { estado: 'cancelada' });
            }
            if (outcome.montoSaldoAFavor > 0 && cliSnap.exists()) {
              tx.update(doc(db, 'clientes', liveAp.clienteId), {
                saldoAFavor: roundMXN((Number(cliSnap.data().saldoAFavor) || 0) + outcome.montoSaldoAFavor),
                actualizadoEn: serverTimestamp(),
              });
            }
            if (canTouchOriginProducts) {
              catalogRestoreItems.forEach((item, idx) => {
                const pSnap = prodSnaps[idx];
                if (!pSnap || !pSnap.exists()) return;
                const pRaw = pSnap.data();
                const dispAnteriorGlobal = Number(pRaw.stockDisponible) || 0;
                tx.update(doc(db, 'productos', item.productoId), {
                  stockDisponible: dispAnteriorGlobal + item.cantidad,
                  stockReservado: Math.max(0, (Number(pRaw.stockReservado) || 0) - item.cantidad),
                  actualizadoEn: serverTimestamp(),
                });

                const iSnap = invSnaps[idx];
                const invPrevDisp =
                  iSnap && iSnap.exists() ? Number(iSnap.data().stockDisponible) || 0 : dispAnteriorGlobal;
                const invPrevRes =
                  iSnap && iSnap.exists() ? Number(iSnap.data().stockReservado) || 0 : 0;
                if (iSnap && iSnap.exists()) {
                  tx.update(doc(db, 'inventario_sucursales', makeInvDocId(originSucId, item.productoId)), {
                    stockDisponible: invPrevDisp + item.cantidad,
                    stockReservado: Math.max(0, invPrevRes - item.cantidad),
                    actualizadoEn: serverTimestamp(),
                  });
                }

                tx.set(doc(db, 'movimientos_inventario', makeId('mov')), {
                  productoId: item.productoId,
                  productoSku: String(pRaw.sku || ''),
                  productoNombre: String(pRaw.nombre || ''),
                  sucursalId: originSucId,
                  sucursalNombre: originSucName,
                  tipo: 'devolucion_apartado',
                  cantidad: item.cantidad,
                  stockAnterior: invPrevDisp,
                  stockNuevo: invPrevDisp + item.cantidad,
                  referenciaFolio: liveAp.folio,
                  motivo: `Devolución cancelación (${outcome.resolucion}): ${motivoLimpio}`.slice(0, 240),
                  usuarioUid: user.uid,
                  usuarioNombre: user.nombre,
                  tiendaId: TIENDA_ID,
                  creadoEn: serverTimestamp(),
                });
              });
            }
          });
        } catch (err) {
          if (err instanceof Error && err.message.includes('penalización')) throw err;
          handleFirestoreError(err, OperationType.WRITE, `apartados/${input.apartadoId}`);
        }
        notify(`Apartado ${folioCancelado} cancelado.`);
        return;
      }

      const apartado = dataset.apartados.find((a) => a.id === input.apartadoId);
      if (!apartado) throw new Error('Apartado no encontrado.');
      const outcome = resolveLayawayCancellation(apartado, input.resolucion, input.montoPenalizacion);
      const originSucId = apartado.sucursalId || effectiveSucursalId;
      const originSucName =
        dataset.sucursales.find((s) => s.id === originSucId)?.nombre ||
        currentSucursal?.nombre ||
        'Tienda Principal';
      const catalogRestoreItems = outcome.stockARestaurar.filter(
        (item) => item.productoId && !item.productoId.startsWith('manual-')
      );
      setDataset((prev) => {
        const extraMovs: MovimientoInventario[] = [];
        const nextProductos = prev.productos.map((p) => {
          const matched = catalogRestoreItems.find((i) => i.productoId === p.id);
          if (!matched) return p;
          const curInv = prev.inventarioSucursales.find(
            (inv) => inv.sucursalId === originSucId && inv.productoId === p.id
          );
          const prevDisp = curInv ? curInv.stockDisponible : p.stockDisponible;
          extraMovs.push({
            id: makeId('mov'),
            productoId: p.id,
            productoSku: p.sku,
            productoNombre: p.nombre,
            sucursalId: originSucId,
            sucursalNombre: originSucName,
            tipo: 'devolucion_apartado',
            cantidad: matched.cantidad,
            stockAnterior: prevDisp,
            stockNuevo: prevDisp + matched.cantidad,
            referenciaFolio: apartado.folio,
            motivo: `Devolución cancelación (${outcome.resolucion}): ${motivoLimpio}`.slice(0, 240),
            usuarioUid: user.uid,
            usuarioNombre: user.nombre,
            creadoEn: now,
          });
          return {
            ...p,
            stockDisponible: p.stockDisponible + matched.cantidad,
            stockReservado: Math.max(0, p.stockReservado - matched.cantidad),
            actualizadoEn: now,
          };
        });
        const nextInv = prev.inventarioSucursales.map((inv) => {
          if (inv.sucursalId !== originSucId) return inv;
          const matched = catalogRestoreItems.find((i) => i.productoId === inv.productoId);
          return matched
            ? {
                ...inv,
                stockDisponible: inv.stockDisponible + matched.cantidad,
                stockReservado: Math.max(0, inv.stockReservado - matched.cantidad),
                actualizadoEn: now,
              }
            : inv;
        });
        return {
          ...prev,
          apartados: prev.apartados.map((a) =>
            a.id === apartado.id
              ? {
                  ...a,
                  estado: 'cancelado',
                  resolucionCancelacion: outcome.resolucion,
                  montoRetenido: outcome.montoRetenido,
                  motivoCancelacion: motivoLimpio,
                  actualizadoEn: now,
                }
              : a
          ),
          ventas: prev.ventas.map((v) =>
            v.id === apartado.ventaId ? { ...v, estado: 'cancelada' } : v
          ),
          clientes:
            outcome.montoSaldoAFavor > 0
              ? prev.clientes.map((c) =>
                  c.id === apartado.clienteId
                    ? { ...c, saldoAFavor: roundMXN(c.saldoAFavor + outcome.montoSaldoAFavor), actualizadoEn: now }
                    : c
                )
              : prev.clientes,
          productos: nextProductos,
          inventarioSucursales: nextInv,
          movimientos: [...extraMovs, ...prev.movimientos],
        };
      });
      notify(`Apartado ${apartado.folio} cancelado.`);
    },
    [assertWritable, user, currentSucursal, effectiveSucursalId, dataset.apartados, dataset.sucursales, notify]
  );

  // Base de datos estrictamente privada de inventario por tienda y cajas privadas por cobrador
  // Nota: dataset.sucursales viene ordenado por creadoEn DESC, por lo que la tienda principal es la asignada al usuario o la más antigua (última).
  const isPrimaryStore =
    (Boolean(user?.sucursalId) && effectiveSucursalId === user?.sucursalId) ||
    (dataset.sucursales.length > 0 &&
      dataset.sucursales[dataset.sucursales.length - 1]?.id === effectiveSucursalId);

  const scopedInventarioSucursales = useMemo(
    () => dataset.inventarioSucursales.filter((inv) => inv.sucursalId === effectiveSucursalId),
    [dataset.inventarioSucursales, effectiveSucursalId]
  );

  const scopedProductos = useMemo(
    () =>
      filterProductosForSucursal({
        productos: dataset.productos,
        inventarioSucursales: dataset.inventarioSucursales,
        sucursalId: effectiveSucursalId,
        includeLegacyWithoutStore: user?.rol === 'admin' && isPrimaryStore,
      }),
    [dataset.productos, dataset.inventarioSucursales, effectiveSucursalId, user?.rol, isPrimaryStore]
  );

  const scopedMovimientos = useMemo(
    () =>
      dataset.movimientos.filter((m) =>
        !m.sucursalId ? user?.rol === 'admin' && isPrimaryStore : m.sucursalId === effectiveSucursalId
      ),
    [dataset.movimientos, effectiveSucursalId, user?.rol, isPrimaryStore]
  );

  const scopedCajasTurnos = useMemo(
    () =>
      user?.rol === 'admin'
        ? dataset.cajasTurnos
        : dataset.cajasTurnos.filter((t) => t.abiertaPorUid === user?.uid),
    [dataset.cajasTurnos, user?.rol, user?.uid]
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      user,
      authReady,
      loadingData,
      connectionStatus,
      recheckConnection,
      darkMode,
      toggleDarkMode,
      activeTicket,
      setActiveTicket,
      toast,
      notify,
      activeSucursalId: effectiveSucursalId,
      setActiveSucursalId,
      currentSucursal,
      activeCajaTurno,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      resendVerificationEmail,
      refreshAuthUser,
      logout,
      configuracion: dataset.configuracion,
      usuarios: user?.rol === 'admin' ? dataset.usuarios : [],
      sucursales: dataset.sucursales,
      inventarioSucursales: scopedInventarioSucursales,
      cajasTurnos: scopedCajasTurnos,
      clientes: dataset.clientes,
      proveedores: dataset.proveedores,
      productos: scopedProductos,
      ventas: dataset.ventas,
      creditos: dataset.creditos,
      apartados: dataset.apartados,
      abonos: dataset.abonos,
      alertas: dataset.alertas,
      movimientos: scopedMovimientos,
      compras: dataset.compras,
      saveConfiguracion,
      saveUsuarioStaff,
      saveSucursal,
      updateOwnSucursalAddress,
      abrirCaja,
      cerrarCaja,
      deleteCajaTurno,
      runAutoDueAlertsCheck,
      addCliente,
      updateCliente,
      deleteCliente,
      clearAllClientes,
      saveProducto,
      deleteProducto,
      toggleProductoActivo,
      saveProveedor,
      deleteProveedor,
      registrarCompraProveedor,
      registrarAjusteInventario,
      deleteMovimientoInventario,
      procesarVentaPOS,
      crearCreditoDirecto,
      deleteCredito,
      crearApartadoDirecto,
      deleteApartado,
      registrarAbonoCredito,
      registrarAbonoApartado,
      deleteAbono,
      clearAbonosYCobranzaDelDia,
      actualizarProximaFechaPago,
      aumentarPagoUsuarioAtrasado,
      registrarAlertaEnviada,
      cancelarApartado,
    }),
    [
      user,
      authReady,
      loadingData,
      connectionStatus,
      recheckConnection,
      darkMode,
      toggleDarkMode,
      activeTicket,
      toast,
      notify,
      effectiveSucursalId,
      setActiveSucursalId,
      currentSucursal,
      activeCajaTurno,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      resendVerificationEmail,
      refreshAuthUser,
      logout,
      dataset,
      scopedInventarioSucursales,
      scopedCajasTurnos,
      scopedProductos,
      scopedMovimientos,
      saveConfiguracion,
      saveUsuarioStaff,
      saveSucursal,
      updateOwnSucursalAddress,
      abrirCaja,
      cerrarCaja,
      deleteCajaTurno,
      runAutoDueAlertsCheck,
      addCliente,
      updateCliente,
      deleteCliente,
      clearAllClientes,
      saveProducto,
      deleteProducto,
      toggleProductoActivo,
      saveProveedor,
      deleteProveedor,
      registrarCompraProveedor,
      registrarAjusteInventario,
      deleteMovimientoInventario,
      procesarVentaPOS,
      crearCreditoDirecto,
      deleteCredito,
      crearApartadoDirecto,
      deleteApartado,
      registrarAbonoCredito,
      registrarAbonoApartado,
      deleteAbono,
      clearAbonosYCobranzaDelDia,
      actualizarProximaFechaPago,
      aumentarPagoUsuarioAtrasado,
      registrarAlertaEnviada,
      cancelarApartado,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreProvider.');
  return ctx;
}
