import type { AlertaVencimiento, Apartado, Credito } from '../types/pos';
import { diffDaysISO, formatMXN, formatShortDate, roundMXN, todayISODate } from './finance';

export const DEFAULT_ALERT_SUBJECT_TEMPLATE =
  '[{{estado}}] {{clienteNombre}} · {{tipoCuenta}} {{folio}} · Pendiente {{montoPendiente}}';

export const DEFAULT_ALERT_BODY_TEMPLATE = [
  'NOTIFICACIÓN AUTOMÁTICA DE VENCIMIENTO — {{nombreTienda}}',
  '──────────────────────────────────────────────────',
  'Estado: {{estado}}',
  'Cliente: {{clienteNombre}}',
  'WhatsApp / Teléfono: {{clienteTelefono}}',
  'Cuenta: {{tipoCuenta}} {{folio}}',
  'Fecha de vencimiento: {{fechaLimite}}',
  'Cuota / Monto a pagar: {{montoAPagar}}',
  'Saldo pendiente total: {{montoPendiente}}',
  '──────────────────────────────────────────────────',
  'Alerta monitoreada automáticamente desde el sistema Mueblería Alquia.',
].join('\n');

export interface AlertTemplateVars {
  estado: string;
  clienteNombre: string;
  clienteTelefono: string;
  tipoCuenta: string;
  folio: string;
  fechaLimite: string;
  montoAPagar: string;
  montoPendiente: string;
  nombreTienda: string;
}

export function renderAlertTemplate(template: string, vars: AlertTemplateVars): string {
  return template
    .replaceAll('{{estado}}', vars.estado)
    .replaceAll('{{clienteNombre}}', vars.clienteNombre)
    .replaceAll('{{clienteTelefono}}', vars.clienteTelefono || 'No registrado')
    .replaceAll('{{tipoCuenta}}', vars.tipoCuenta)
    .replaceAll('{{folio}}', vars.folio)
    .replaceAll('{{fechaLimite}}', vars.fechaLimite)
    .replaceAll('{{montoAPagar}}', vars.montoAPagar)
    .replaceAll('{{montoPendiente}}', vars.montoPendiente)
    .replaceAll('{{nombreTienda}}', vars.nombreTienda);
}

export interface PendingDueAlert {
  operacionTipo: 'credito' | 'apartado';
  operacionId: string;
  operacionFolio: string;
  tipoAlerta: 'vencido' | 'por_vencer';
  claveAlerta: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  montoAPagar: number;
  saldoPendiente: number;
  fechaLimite: string;
  diasAtraso: number;
  diasRestantes: number;
  correoDestino: string;
  asunto: string;
  mensaje: string;
  mailtoUrl: string;
}

/**
 * Escanea créditos activos y apartados vigentes para detectar cuentas vencidas o
 * próximas a vencer dentro de `diasAnticipacion`, deduplicando contra `existingAlerts` del día.
 */
export function evaluateDueAlerts(params: {
  creditos: Credito[];
  apartados: Apartado[];
  existingAlerts: AlertaVencimiento[];
  diasAnticipacion: number;
  todayISO?: string;
  correoDestino: string;
  nombreTienda: string;
  plantillaAsunto?: string;
  plantillaCuerpo?: string;
}): PendingDueAlert[] {
  const today = params.todayISO || todayISODate();
  const leadDays = Math.max(0, Math.min(30, Math.floor(params.diasAnticipacion)));
  const subjectTpl = (params.plantillaAsunto || DEFAULT_ALERT_SUBJECT_TEMPLATE).trim();
  const bodyTpl = (params.plantillaCuerpo || DEFAULT_ALERT_BODY_TEMPLATE).trim();
  const to = (params.correoDestino || '').trim();

  const existingKeys = new Set<string>();
  params.existingAlerts.forEach((al) => {
    if (al.claveAlerta) {
      existingKeys.add(al.claveAlerta);
    } else if (al.creadoEn && al.creadoEn.slice(0, 10) === today) {
      existingKeys.add(`${al.operacionTipo}_${al.operacionId}_${today}_${al.tipoAlerta || 'vencido'}`);
    }
  });

  const results: PendingDueAlert[] = [];

  const processCandidate = (candidate: {
    operacionTipo: 'credito' | 'apartado';
    operacionId: string;
    operacionFolio: string;
    clienteId: string;
    clienteNombre: string;
    clienteTelefono: string;
    montoAPagar: number;
    saldoPendiente: number;
    targetDate: string;
  }) => {
    if (!candidate.targetDate || candidate.targetDate.length < 10) return;
    if (candidate.saldoPendiente <= 0) return;

    const daysDiff = diffDaysISO(today, candidate.targetDate.slice(0, 10));
    let tipoAlerta: 'vencido' | 'por_vencer' | null = null;
    let diasAtraso = 0;
    let diasRestantes = 0;

    if (daysDiff < 0) {
      tipoAlerta = 'vencido';
      diasAtraso = Math.abs(daysDiff);
    } else if (daysDiff <= leadDays) {
      tipoAlerta = 'por_vencer';
      diasRestantes = daysDiff;
    }

    if (!tipoAlerta) return;

    const claveAlerta = `${candidate.operacionTipo}_${candidate.operacionId}_${today}_${tipoAlerta}`;
    if (existingKeys.has(claveAlerta)) return;

    const estadoLabel =
      tipoAlerta === 'vencido'
        ? `PAGO VENCIDO (${diasAtraso} día(s) de atraso)`
        : diasRestantes === 0
          ? 'VENCE HOY'
          : `PRÓXIMO A VENCER (en ${diasRestantes} día(s))`;

    const vars: AlertTemplateVars = {
      estado: estadoLabel,
      clienteNombre: candidate.clienteNombre,
      clienteTelefono: candidate.clienteTelefono || 'No registrado',
      tipoCuenta: candidate.operacionTipo === 'credito' ? 'Crédito' : 'Apartado',
      folio: candidate.operacionFolio,
      fechaLimite: formatShortDate(candidate.targetDate),
      montoAPagar: formatMXN(candidate.montoAPagar),
      montoPendiente: formatMXN(candidate.saldoPendiente),
      nombreTienda: params.nombreTienda || 'Mueblería Alquia',
    };

    const asunto = renderAlertTemplate(subjectTpl, vars).slice(0, 220);
    const mensaje = renderAlertTemplate(bodyTpl, vars).slice(0, 1600);
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;

    results.push({
      operacionTipo: candidate.operacionTipo,
      operacionId: candidate.operacionId,
      operacionFolio: candidate.operacionFolio,
      tipoAlerta,
      claveAlerta,
      clienteId: candidate.clienteId,
      clienteNombre: candidate.clienteNombre,
      clienteTelefono: candidate.clienteTelefono,
      montoAPagar: roundMXN(candidate.montoAPagar),
      saldoPendiente: roundMXN(candidate.saldoPendiente),
      fechaLimite: candidate.targetDate.slice(0, 10),
      diasAtraso,
      diasRestantes,
      correoDestino: to,
      asunto,
      mensaje,
      mailtoUrl,
    });
  };

  for (const c of params.creditos) {
    if (c.estado !== 'activo' || c.saldoPendiente <= 0) continue;
    processCandidate({
      operacionTipo: 'credito',
      operacionId: c.id,
      operacionFolio: c.folio,
      clienteId: c.clienteId,
      clienteNombre: c.clienteNombre,
      clienteTelefono: c.clienteTelefono,
      montoAPagar: Math.min(c.montoPago, c.saldoPendiente),
      saldoPendiente: c.saldoPendiente,
      targetDate: c.proximaFechaPago,
    });
  }

  for (const a of params.apartados) {
    if (a.estado !== 'vigente' || a.saldoPendiente <= 0) continue;
    const targetDate =
      a.proximoPagoFecha && a.proximoPagoFecha < a.fechaLimite
        ? a.proximoPagoFecha
        : a.fechaLimite;
    processCandidate({
      operacionTipo: 'apartado',
      operacionId: a.id,
      operacionFolio: a.folio,
      clienteId: a.clienteId,
      clienteNombre: a.clienteNombre,
      clienteTelefono: a.clienteTelefono,
      montoAPagar: a.saldoPendiente,
      saldoPendiente: a.saldoPendiente,
      targetDate,
    });
  }

  return results.sort((a, b) => {
    if (a.tipoAlerta !== b.tipoAlerta) return a.tipoAlerta === 'vencido' ? -1 : 1;
    return b.diasAtraso - a.diasAtraso;
  });
}

/**
 * Envía el correo de alerta automáticamente a través de EmailJS REST API
 * cuando el Administrador configuró Service ID, Template ID y Public Key.
 */
export async function dispatchAlertEmailViaEmailJS(params: {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
  alert: PendingDueAlert;
}): Promise<{ sent: boolean; method: 'automatico_emailjs' | 'registro_automatico'; error?: string }> {
  const serviceId = (params.serviceId || '').trim();
  const templateId = (params.templateId || '').trim();
  const publicKey = (params.publicKey || '').trim();

  if (!serviceId || !templateId || !publicKey || !params.alert.correoDestino) {
    return { sent: false, method: 'registro_automatico' };
  }

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: params.alert.correoDestino,
          subject: params.alert.asunto,
          message: params.alert.mensaje,
          cliente_nombre: params.alert.clienteNombre,
          cliente_telefono: params.alert.clienteTelefono,
          monto_pendiente: formatMXN(params.alert.saldoPendiente),
          monto_a_pagar: formatMXN(params.alert.montoAPagar),
          folio: params.alert.operacionFolio,
          tipo_cuenta: params.alert.operacionTipo === 'credito' ? 'Crédito' : 'Apartado',
          fecha_limite: formatShortDate(params.alert.fechaLimite),
          tipo_alerta: params.alert.tipoAlerta === 'vencido' ? 'VENCIDO' : 'PRÓXIMO A VENCER',
        },
      }),
    });

    if (!response.ok) {
      return {
        sent: false,
        method: 'registro_automatico',
        error: `EmailJS respondió ${response.status}`,
      };
    }

    return { sent: true, method: 'automatico_emailjs' };
  } catch (err) {
    return {
      sent: false,
      method: 'registro_automatico',
      error: err instanceof Error ? err.message : 'Error de red al enviar correo',
    };
  }
}
