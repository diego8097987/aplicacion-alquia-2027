export type UserRole = 'admin' | 'cobrador';

export type NavTab =
  | 'dashboard'
  | 'caja'
  | 'pos'
  | 'clientes'
  | 'creditos'
  | 'apartados'
  | 'productos'
  | 'inventario'
  | 'proveedores'
  | 'configuracion';

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';
export type TipoVenta = 'contado' | 'credito' | 'apartado';
export type FrecuenciaPago = 'semanal' | 'quincenal' | 'mensual';
export type ResolucionCancelacion = 'ninguna' | 'reembolso' | 'saldo_a_favor' | 'penalizacion';
export type EstadoPuntualidad = 'al_dia' | 'atrasado';

export interface AppUser {
  uid: string;
  nombre: string;
  correo: string;
  rol: UserRole;
  sucursalId?: string;
  activo: boolean;
  emailVerified: boolean;
  modo: 'firebase' | 'local';
}

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  telefono?: string;
  encargadoUid?: string;
  encargadoNombre?: string;
  propietarioUid: string;
  activa: boolean;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface InventarioSucursal {
  id: string;
  sucursalId: string;
  sucursalNombre: string;
  productoId: string;
  propietarioUid: string;
  stockDisponible: number;
  stockReservado: number;
  stockMinimo: number;
  actualizadoEn: string;
}

export interface CajaTurno {
  id: string;
  sucursalId?: string;
  sucursalNombre?: string;
  sucursalDireccion?: string;
  encargadoTienda?: string;
  abiertaPorUid: string;
  abiertaPorNombre: string;
  fondoInicial: number;
  estado: 'abierta' | 'cerrada';
  abiertaEn: string;
  cerradaEn?: string;
  cerradaPorUid?: string;
  cerradaPorNombre?: string;
  totalVentasDia?: number;
  totalAbonosDia?: number;
  totalEfectivo?: number;
  totalTarjeta?: number;
  totalTransferencia?: number;
  cantidadVentasBorradas?: number;
  notasCierre?: string;
}

export interface ConfiguracionTienda {
  nombreComercial: string;
  ubicacion: string;
  telefono: string;
  mensajeTicket: string;
  correoAlertas: string;
  diasAnticipacionAlerta: number;
  alertasAutomaticasActivas: boolean;
  plantillaAsuntoAlerta: string;
  plantillaCuerpoAlerta: string;
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
  consecutivoVenta: number;
  consecutivoCredito: number;
  consecutivoApartado: number;
  consecutivoAbono: number;
  consecutivoCompra: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  referencias: string;
  saldoAFavor: number;
  activo: boolean;
  creadoPorUid: string;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  correo: string;
  ciudad: string;
  categorias: string;
  notas: string;
  activo: boolean;
  creadoEn: string;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  marca: string;
  precioContado: number;
  precioCredito: number;
  costoUnitario: number;
  stockDisponible: number;
  stockReservado: number;
  stockMinimo: number;
  proveedorId: string;
  creadoPorUid?: string;
  creadoPorSucursalId?: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface VentaItem {
  productoId: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Venta {
  id: string;
  folio: string;
  tipo: TipoVenta;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  sucursalId?: string;
  sucursalNombre?: string;
  sucursalDireccion?: string;
  encargadoTienda?: string;
  items: VentaItem[];
  subtotal: number;
  descuento: number;
  saldoAFavorAplicado: number;
  total: number;
  pagoInicial: number;
  metodoPago: MetodoPago;
  referenciaOperacionId?: string;
  referenciaFolio?: string;
  estado: 'completada' | 'activa' | 'cancelada';
  vendedorUid: string;
  vendedorNombre: string;
  creadoEn: string;
}

export interface Credito {
  id: string;
  folio: string;
  ventaId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  sucursalId?: string;
  itemsResumen: string;
  montoTotal: number;
  enganche: number;
  totalAbonado: number;
  saldoPendiente: number;
  frecuencia: FrecuenciaPago;
  numPagos: number;
  montoPago: number;
  pagosRealizados: number;
  proximaFechaPago: string; // YYYY-MM-DD
  recargosAcumulados?: number;
  ultimoMotivoIncremento?: string;
  estado: 'activo' | 'liquidado' | 'cancelado';
  vendedorUid: string;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface Apartado {
  id: string;
  folio: string;
  ventaId: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  sucursalId?: string;
  items: VentaItem[];
  montoTotal: number;
  anticipoInicial: number;
  totalAbonado: number;
  saldoPendiente: number;
  fechaLimite: string; // YYYY-MM-DD
  proximoPagoFecha?: string; // YYYY-MM-DD
  recargosAcumulados?: number;
  ultimoMotivoIncremento?: string;
  condiciones: string;
  estado: 'vigente' | 'liquidado' | 'cancelado';
  resolucionCancelacion: ResolucionCancelacion;
  montoRetenido: number;
  motivoCancelacion?: string;
  vendedorUid: string;
  creadoEn: string;
  actualizadoEn?: string;
}

export interface Abono {
  id: string;
  folio: string;
  tipoOperacion: 'credito' | 'apartado';
  operacionId: string;
  operacionFolio: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  monto: number;
  saldoAnterior: number;
  saldoNuevo: number;
  metodoPago: MetodoPago;
  fechaProgramada?: string;
  estadoPuntualidad: EstadoPuntualidad;
  diasAtraso: number;
  notas: string;
  sucursalId?: string;
  sucursalNombre?: string;
  cuentaSucursalId?: string;
  cuentaSucursalNombre?: string;
  enOtraTienda?: boolean;
  cobradorUid: string;
  cobradorNombre: string;
  creadoEn: string;
}

export interface AlertaVencimiento {
  id: string;
  operacionTipo: 'credito' | 'apartado';
  operacionId: string;
  operacionFolio: string;
  tipoAlerta?: 'vencido' | 'por_vencer';
  claveAlerta?: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  montoAPagar: number;
  saldoPendiente?: number;
  fechaLimite: string;
  diasAtraso: number;
  diasRestantes?: number;
  correoDestino: string;
  asunto?: string;
  mensaje?: string;
  metodoEnvio?: 'automatico_emailjs' | 'mailto' | 'registro_automatico';
  estado: 'pendiente' | 'enviada';
  creadoPorUid: string;
  creadoEn: string;
}

export interface MovimientoInventario {
  id: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  sucursalId?: string;
  sucursalNombre?: string;
  tipo: 'compra' | 'venta' | 'apartado' | 'devolucion_apartado' | 'ajuste';
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  referenciaFolio: string;
  motivo: string;
  usuarioUid: string;
  usuarioNombre: string;
  creadoEn: string;
}

export interface CompraProveedorItem {
  productoId: string;
  sku: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface CompraProveedor {
  id: string;
  folio: string;
  proveedorId: string;
  proveedorNombre: string;
  sucursalId?: string;
  items: CompraProveedorItem[];
  totalCosto: number;
  notas: string;
  registradoPorUid: string;
  registradoPorNombre: string;
  creadoEn: string;
}

export interface TicketData {
  tipoDocumento:
    | 'venta_contado'
    | 'venta_credito'
    | 'apartado'
    | 'abono_credito'
    | 'abono_apartado'
    | 'liquidacion_apartado';
  folio: string;
  fechaISO: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  atendidoPor: string;
  sucursalNombre?: string;
  sucursalDireccion?: string;
  encargadoTienda?: string;
  enOtraTienda?: boolean;
  cuentaSucursalNombre?: string;
  metodoPago: MetodoPago;
  items?: VentaItem[];
  cuentaConcepto?: string;
  cuentaTotal?: number;
  cuentaTotalAbonado?: number;
  cuentaEstado?: string;
  subtotal?: number;
  descuento?: number;
  saldoAFavorAplicado?: number;
  montoTotal: number;
  pagoRecibido: number;
  cambio?: number;
  saldoAnterior?: number;
  saldoPendiente: number;
  referenciaFolio?: string;
  planInfo?: string;
  fechaLimite?: string;
  proximoPagoFecha?: string;
  estadoPuntualidad?: EstadoPuntualidad;
  diasAtraso?: number;
  notas?: string;
}
