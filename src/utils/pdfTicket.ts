import { jsPDF } from 'jspdf';
import type {
  Abono,
  CajaTurno,
  ConfiguracionTienda,
  InventarioSucursal,
  Producto,
  Sucursal,
  TicketData,
  Venta,
} from '../types/pos';
import {
  formatDateTimeMX,
  formatMXN,
  formatShortDate,
  getProductStoreAvailability,
  summarizeCajaShift,
} from './finance';

const TITULO_PDF: Record<TicketData['tipoDocumento'], string> = {
  venta_contado: 'COMPROBANTE DE VENTA — CONTADO',
  venta_credito: 'COMPROBANTE DE VENTA A CRÉDITO',
  apartado: 'COMPROBANTE DE APARTADO',
  abono_credito: 'RECIBO DE ABONO A CRÉDITO',
  abono_apartado: 'RECIBO DE ABONO A APARTADO',
  liquidacion_apartado: 'COMPROBANTE DE LIQUIDACIÓN DE APARTADO',
};

/**
 * Dibuja el logotipo geométrico de pirámide de Mueblería Alquia
 * en alta precisión vectorial sobre el encabezado del PDF.
 */
function drawAlquiaPyramidEmblem(doc: jsPDF, x: number, y: number, scale: number) {
  const pt = (px: number, py: number): [number, number] => [x + px * scale, y + py * scale];
  const drawPoly = (points: Array<[number, number]>) => {
    const start = points[0];
    const deltas: Array<[number, number]> = [];
    for (let i = 1; i < points.length; i++) {
      deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
    }
    doc.lines(deltas, start[0], start[1], [1, 1], 'F', true);
  };

  doc.setFillColor(0, 0, 0);
  drawPoly([pt(12, 2), pt(16.8, 6.2), pt(12, 10.4), pt(7.2, 6.2)]);
  drawPoly([pt(5.2, 7.8), pt(6.6, 6.6), pt(12, 11.4), pt(17.4, 6.6), pt(18.8, 7.8), pt(12, 13.8)]);
  drawPoly([pt(3.0, 9.8), pt(4.4, 8.6), pt(12, 15.2), pt(19.6, 8.6), pt(21.0, 9.8), pt(12, 17.6)]);
  drawPoly([pt(0.8, 11.8), pt(2.2, 10.6), pt(12, 19.0), pt(21.8, 10.6), pt(23.2, 11.8), pt(12, 21.4)]);
}

function drawStandardHeader(
  doc: jsPDF,
  params: {
    storeName: string;
    storeAddress: string;
    storePhone?: string;
    rightLabel: string;
    rightTitle: string;
    rightSubtitle: string;
  }
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;

  doc.setFillColor(17, 17, 20);
  doc.rect(0, 0, pageWidth, 42, 'F');
  doc.setFillColor(200, 30, 30);
  doc.rect(0, 42, pageWidth, 2.5, 'F');
  doc.setFillColor(212, 163, 41);
  doc.rect(0, 44.5, pageWidth, 1.2, 'F');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 7, 27, 27, 2.5, 2.5, 'F');
  drawAlquiaPyramidEmblem(doc, margin + 2.2, 9.5, 0.94);

  const headerTextX = margin + 32;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text((params.storeName || 'Mueblería Alquia').toUpperCase(), headerTextX, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(229, 229, 234);
  const addrLines = doc.splitTextToSize(
    params.storeAddress || 'Apaseo el Alto, Guanajuato, México',
    92
  );
  doc.text(addrLines[0] || '', headerTextX, 24);
  if (params.storePhone) {
    doc.text(`Tel. / WhatsApp: ${params.storePhone}`, headerTextX, 30);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(237, 208, 109);
  doc.text(params.rightLabel, pageWidth - margin, 15, { align: 'right' });

  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(params.rightTitle, pageWidth - margin, 23, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(212, 212, 218);
  doc.text(params.rightSubtitle, pageWidth - margin, 31, { align: 'right' });
}

export interface ReceiptEmailPayload {
  to: string;
  subject: string;
  body: string;
  mailtoUrl: string;
}

/**
 * Genera el asunto, cuerpo y enlace mailto: para enviar el recibo digital por correo electrónico.
 */
export function buildReceiptEmailPayload(
  ticket: TicketData,
  config: Pick<ConfiguracionTienda, 'nombreComercial' | 'ubicacion' | 'telefono' | 'mensajeTicket'> & {
    sucursalNombre?: string;
    sucursalDireccion?: string;
    encargadoTienda?: string;
  },
  recipientEmail = ''
): ReceiptEmailPayload {
  const storeName = config.nombreComercial || 'Mueblería Alquia';
  const storeAddress =
    ticket.sucursalDireccion || config.sucursalDireccion || config.ubicacion || 'Apaseo el Alto, Guanajuato, México';
  const encargado = ticket.encargadoTienda || config.encargadoTienda || '';
  const docTitle = TITULO_PDF[ticket.tipoDocumento];
  const isAbono =
    ticket.tipoDocumento === 'abono_credito' ||
    ticket.tipoDocumento === 'abono_apartado' ||
    ticket.tipoDocumento === 'liquidacion_apartado';

  const subject = `${docTitle} ${ticket.folio} — ${ticket.clienteNombre} · ${storeName}`;
  const lines: string[] = [
    `${storeName.toUpperCase()} — RECIBO DIGITAL`,
    storeAddress,
    ...(config.telefono ? [`Tel / WhatsApp: ${config.telefono}`] : []),
    '────────────────────────────────────────',
    `${docTitle}`,
    `Folio de recibo: ${ticket.folio}`,
    ...(ticket.referenciaFolio ? [`Cuenta / Referencia: ${ticket.referenciaFolio}`] : []),
    `Fecha: ${formatShortDate(ticket.fechaISO)}`,
    `Cliente: ${ticket.clienteNombre}`,
    ...(ticket.clienteTelefono ? [`Teléfono / WhatsApp: ${ticket.clienteTelefono}`] : []),
    `Atendió: ${ticket.atendidoPor}`,
    ...(encargado ? [`Encargado de tienda: ${encargado}`] : []),
    `Método de pago: ${(ticket.metodoPago || 'efectivo').toUpperCase()}`,
  ];

  if (ticket.cuentaConcepto) {
    lines.push('────────────────────────────────────────');
    lines.push('DETALLE DE LA CUENTA DEL CLIENTE');
    lines.push(`Concepto / Artículos: ${ticket.cuentaConcepto}`);
    if (typeof ticket.cuentaTotal === 'number') {
      lines.push(`Total de la cuenta: ${formatMXN(ticket.cuentaTotal)}`);
    }
    if (typeof ticket.cuentaTotalAbonado === 'number') {
      lines.push(`Total abonado acumulado: ${formatMXN(ticket.cuentaTotalAbonado)}`);
    }
    if (ticket.planInfo) {
      lines.push(`Plan / Estado: ${ticket.planInfo}`);
    }
  }

  lines.push('────────────────────────────────────────');
  if (typeof ticket.saldoAnterior === 'number') {
    lines.push(`Saldo anterior: ${formatMXN(ticket.saldoAnterior)}`);
  } else {
    lines.push(`Total operación: ${formatMXN(ticket.montoTotal)}`);
  }
  lines.push(`${isAbono ? 'MONTO ABONADO' : 'PAGO RECIBIDO'}: ${formatMXN(ticket.pagoRecibido)}`);
  lines.push(`SALDO RESTANTE: ${formatMXN(ticket.saldoPendiente)}`);

  if (ticket.saldoPendiente <= 0) {
    lines.push('Estado: CUENTA LIQUIDADA TOTALMENTE');
  } else {
    if (ticket.proximoPagoFecha) {
      lines.push(`Próximo pago programado: ${formatShortDate(ticket.proximoPagoFecha)}`);
    }
    if (ticket.fechaLimite) {
      lines.push(`Fecha límite: ${formatShortDate(ticket.fechaLimite)}`);
    }
  }

  if (ticket.notas) {
    lines.push(`Notas: ${ticket.notas}`);
  }

  lines.push('────────────────────────────────────────');
  lines.push(config.mensajeTicket || 'Conserve este comprobante para garantías y aclaraciones.');

  const body = lines.join('\n');
  const cleanTo = recipientEmail.trim();
  const mailtoUrl = `mailto:${encodeURIComponent(cleanTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return {
    to: cleanTo,
    subject,
    body,
    mailtoUrl,
  };
}

/**
 * Envía el recibo digital por correo electrónico vía EmailJS si el Administrador
 * ya configuró las credenciales de envío automático; en caso contrario retorna sent: false
 * para que la UI abra el correo prellenado mediante mailto:.
 */
export async function dispatchReceiptEmailViaEmailJS(params: {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
  payload: ReceiptEmailPayload;
  ticket: TicketData;
}): Promise<{ sent: boolean; error?: string }> {
  const serviceId = (params.serviceId || '').trim();
  const templateId = (params.templateId || '').trim();
  const publicKey = (params.publicKey || '').trim();

  if (!serviceId || !templateId || !publicKey || !params.payload.to) {
    return { sent: false };
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
          to_email: params.payload.to,
          subject: params.payload.subject,
          message: params.payload.body,
          cliente_nombre: params.ticket.clienteNombre,
          cliente_telefono: params.ticket.clienteTelefono || 'No registrado',
          folio: params.ticket.folio,
          referencia: params.ticket.referenciaFolio || params.ticket.folio,
          monto_abonado: formatMXN(params.ticket.pagoRecibido),
          saldo_pendiente: formatMXN(params.ticket.saldoPendiente),
          monto_pendiente: formatMXN(params.ticket.saldoPendiente),
          fecha_limite: params.ticket.proximoPagoFecha
            ? formatShortDate(params.ticket.proximoPagoFecha)
            : params.ticket.fechaLimite
              ? formatShortDate(params.ticket.fechaLimite)
              : 'Liquidado',
          tipo_cuenta: TITULO_PDF[params.ticket.tipoDocumento],
        },
      }),
    });

    if (!response.ok) {
      return { sent: false, error: `Servicio de correo respondió ${response.status}` };
    }

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Error de red al enviar correo',
    };
  }
}

/**
 * Construye el documento jsPDF en hoja tamaño Carta con el logotipo de Mueblería Alquia,
 * detalle completo de la cuenta del cliente, monto abonado y saldo restante.
 */
export function createFullPageTicketPDFDoc(
  ticket: TicketData,
  config: Pick<ConfiguracionTienda, 'nombreComercial' | 'ubicacion' | 'telefono' | 'mensajeTicket'> & {
    sucursalDireccion?: string;
    encargadoTienda?: string;
  }
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const storeAddress =
    ticket.sucursalDireccion || config.sucursalDireccion || config.ubicacion || 'Apaseo el Alto, Guanajuato, México';
  const encargado = ticket.encargadoTienda || config.encargadoTienda || '';
  const isAbono =
    ticket.tipoDocumento === 'abono_credito' ||
    ticket.tipoDocumento === 'abono_apartado' ||
    ticket.tipoDocumento === 'liquidacion_apartado';

  drawStandardHeader(doc, {
    storeName: config.nombreComercial || 'Mueblería Alquia',
    storeAddress,
    storePhone: config.telefono,
    rightLabel: isAbono ? 'RECIBO DIGITAL DE ABONO' : 'FOLIO DE COMPROBANTE',
    rightTitle: ticket.folio,
    rightSubtitle: `Fecha: ${formatShortDate(ticket.fechaISO)}`,
  });

  // Título de documento
  let y = 55;
  doc.setTextColor(200, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(TITULO_PDF[ticket.tipoDocumento], margin, y);

  if (ticket.estadoPuntualidad) {
    const badgeLabel =
      ticket.estadoPuntualidad === 'atrasado'
        ? `PAGO ATRASADO (${ticket.diasAtraso || 1} día(s))`
        : 'PAGO AL DÍA';
    doc.setFontSize(9.5);
    if (ticket.estadoPuntualidad === 'atrasado') {
      doc.setTextColor(200, 30, 30);
    } else {
      doc.setTextColor(22, 163, 74);
    }
    doc.text(badgeLabel, pageWidth - margin, y, { align: 'right' });
  }

  y += 5;
  doc.setDrawColor(225, 225, 230);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);

  // Datos del cliente, sucursal y encargado
  y += 7;
  const cardHeight = encargado ? 36 : 28;
  doc.setFillColor(248, 248, 250);
  doc.setDrawColor(230, 230, 235);
  doc.roundedRect(margin, y - 4, contentWidth, cardHeight, 2.5, 2.5, 'FD');

  doc.setTextColor(95, 95, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CLIENTE', margin + 5, y + 1.5);
  doc.text('WHATSAPP / TELÉFONO', margin + 98, y + 1.5);

  doc.setTextColor(17, 17, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(ticket.clienteNombre || 'Cliente mostrador', margin + 5, y + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(ticket.clienteTelefono || 'No registrado', margin + 98, y + 7.5);

  doc.setTextColor(95, 95, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ATENDIÓ', margin + 5, y + 15);
  doc.text('MÉTODO DE PAGO', margin + 98, y + 15);
  if (ticket.referenciaFolio) {
    doc.text('CUENTA / REFERENCIA', margin + 145, y + 15);
  }

  doc.setTextColor(17, 17, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(ticket.atendidoPor || 'Mostrador', margin + 5, y + 20.5);
  doc.text((ticket.metodoPago || 'efectivo').toUpperCase(), margin + 98, y + 20.5);
  if (ticket.referenciaFolio) {
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.referenciaFolio, margin + 145, y + 20.5);
  }

  if (encargado) {
    doc.setTextColor(95, 95, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('ENCARGADO DE TIENDA', margin + 5, y + 27.5);
    if (ticket.sucursalNombre) {
      doc.text('SUCURSAL / TIENDA', margin + 98, y + 27.5);
    }
    doc.setTextColor(17, 17, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(encargado, margin + 5, y + 32.5);
    if (ticket.sucursalNombre) {
      doc.setFont('helvetica', 'normal');
      doc.text(ticket.sucursalNombre, margin + 98, y + 32.5);
    }
  }

  y += cardHeight + 4;

  // Bloque dedicado: DETALLE DE LA CUENTA DEL CLIENTE (para todos los abonos)
  if (isAbono || ticket.cuentaConcepto || typeof ticket.cuentaTotal === 'number') {
    const concepto =
      ticket.cuentaConcepto ||
      (ticket.items && ticket.items.length > 0
        ? ticket.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')
        : `Cuenta ${ticket.referenciaFolio || ticket.folio}`);
    const conceptoLines = doc.splitTextToSize(concepto, contentWidth - 10).slice(0, 2);
    const totalCuenta = typeof ticket.cuentaTotal === 'number' ? ticket.cuentaTotal : ticket.montoTotal;
    const totalAbonadoAcum =
      typeof ticket.cuentaTotalAbonado === 'number'
        ? ticket.cuentaTotalAbonado
        : Math.max(0, totalCuenta - ticket.saldoPendiente);
    const pctPagado =
      totalCuenta > 0 ? Math.min(100, Math.max(0, Math.round((totalAbonadoAcum / totalCuenta) * 100))) : 100;

    const acctCardHeight = 29 + conceptoLines.length * 4.5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(200, 30, 30);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, acctCardHeight, 2.5, 2.5, 'FD');

    doc.setFillColor(17, 17, 20);
    doc.roundedRect(margin, y, contentWidth, 7.5, 2, 2, 'F');
    doc.setTextColor(237, 208, 109);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('DETALLE DE LA CUENTA DEL CLIENTE', margin + 4, y + 5);
    const cuentaTipoLabel =
      ticket.tipoDocumento === 'abono_credito' ? 'CUENTA DE CRÉDITO' : 'CUENTA DE APARTADO';
    doc.setTextColor(255, 255, 255);
    doc.text(
      `${cuentaTipoLabel} · ${ticket.referenciaFolio || ticket.folio}`,
      pageWidth - margin - 4,
      y + 5,
      { align: 'right' }
    );

    let cy = y + 12.5;
    doc.setTextColor(95, 95, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.text('ARTÍCULOS / CONCEPTO DE LA CUENTA:', margin + 4, cy);
    cy += 4.3;
    doc.setTextColor(17, 17, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.text(conceptoLines, margin + 4, cy);
    cy += conceptoLines.length * 4.5 + 2.5;

    // 3 columnas de estado de cuenta
    const colW = (contentWidth - 8) / 3;
    doc.setFontSize(7.8);
    doc.setTextColor(95, 95, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL DE LA CUENTA', margin + 4, cy);
    doc.text('TOTAL ABONADO ACUMULADO', margin + 4 + colW, cy);
    doc.text('AVANCE DE LIQUIDACIÓN', margin + 4 + colW * 2, cy);

    cy += 5;
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 20);
    doc.text(formatMXN(totalCuenta), margin + 4, cy);
    doc.setTextColor(22, 128, 61);
    doc.text(formatMXN(totalAbonadoAcum), margin + 4 + colW, cy);
    doc.setTextColor(17, 17, 20);
    doc.text(`${pctPagado}% cubierto`, margin + 4 + colW * 2, cy);

    // Barra de progreso de la cuenta
    const barY = cy + 2.5;
    const barW = contentWidth - 8;
    doc.setFillColor(232, 232, 238);
    doc.roundedRect(margin + 4, barY, barW, 2.2, 1, 1, 'F');
    if (pctPagado > 0) {
      doc.setFillColor(pctPagado >= 100 ? 22 : 212, pctPagado >= 100 ? 163 : 163, pctPagado >= 100 ? 74 : 41);
      doc.roundedRect(margin + 4, barY, Math.max(3, (barW * pctPagado) / 100), 2.2, 1, 1, 'F');
    }

    y += acctCardHeight + 7;
  }

  // Tabla de artículos (si aplica)
  if (ticket.items && ticket.items.length > 0) {
    doc.setFillColor(17, 17, 20);
    doc.rect(margin, y, contentWidth, 8.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CANT.', margin + 3, y + 5.7);
    doc.text('SKU', margin + 20, y + 5.7);
    doc.text('DESCRIPCIÓN DEL ARTÍCULO', margin + 50, y + 5.7);
    doc.text('P. UNITARIO', pageWidth - margin - 34, y + 5.7, { align: 'right' });
    doc.text('IMPORTE', pageWidth - margin - 3, y + 5.7, { align: 'right' });

    y += 8.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);

    ticket.items.forEach((item, index) => {
      if (y > pageHeight - 75) {
        doc.addPage();
        y = 20;
      }
      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 252);
        doc.rect(margin, y, contentWidth, 8, 'F');
      }
      doc.setTextColor(17, 17, 20);
      doc.text(String(item.cantidad), margin + 4, y + 5.5);
      doc.setTextColor(100, 100, 110);
      doc.text(item.sku || '—', margin + 20, y + 5.5);
      doc.setTextColor(17, 17, 20);
      const desc = item.nombre.length > 42 ? `${item.nombre.slice(0, 40)}...` : item.nombre;
      doc.text(desc, margin + 50, y + 5.5);
      doc.text(formatMXN(item.precioUnitario), pageWidth - margin - 34, y + 5.5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatMXN(item.subtotal), pageWidth - margin - 3, y + 5.5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setDrawColor(238, 238, 242);
      doc.line(margin, y + 8, pageWidth - margin, y + 8);
      y += 8;
    });

    y += 8;
  }

  // Resumen financiero
  if (y > pageHeight - 72) {
    doc.addPage();
    y = 22;
  }
  const summaryStartY = y;
  const leftColWidth = contentWidth * 0.50;

  doc.setTextColor(17, 17, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DETALLES Y CONDICIONES', margin, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(65, 65, 75);

  const infoLines: string[] = [];
  if (ticket.proximoPagoFecha && ticket.saldoPendiente > 0) {
    infoLines.push(`Próximo pago programado: ${formatShortDate(ticket.proximoPagoFecha)}`);
  }
  if (ticket.planInfo) {
    infoLines.push(`Plan: ${ticket.planInfo}`);
  }
  if (ticket.fechaLimite && ticket.saldoPendiente > 0) {
    infoLines.push(`Fecha límite: ${formatShortDate(ticket.fechaLimite)}`);
  }
  if (ticket.notas) {
    infoLines.push(`Observaciones: ${ticket.notas}`);
  }
  if (infoLines.length === 0) {
    infoLines.push(`Operación registrada en ${config.nombreComercial || 'Mueblería Alquia'}.`);
  }

  infoLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, leftColWidth);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 5 + 2;
  });

  // Caja derecha de importes
  const boxX = margin + contentWidth * 0.54;
  const boxW = contentWidth * 0.46;
  let ry = summaryStartY - 2;

  const drawRow = (
    label: string,
    value: string,
    bold = false,
    accent?: 'red' | 'gold' | 'green'
  ) => {
    if (accent === 'red') {
      doc.setFillColor(254, 242, 242);
      doc.rect(boxX, ry - 4.5, boxW, 8.5, 'F');
      doc.setTextColor(185, 28, 28);
    } else if (accent === 'gold') {
      doc.setFillColor(254, 248, 226);
      doc.rect(boxX, ry - 4.5, boxW, 8.5, 'F');
      doc.setTextColor(17, 17, 20);
    } else if (accent === 'green') {
      doc.setFillColor(236, 253, 245);
      doc.rect(boxX, ry - 4.5, boxW, 8.5, 'F');
      doc.setTextColor(22, 128, 61);
    } else {
      doc.setTextColor(bold ? 17 : 80, bold ? 17 : 80, bold ? 20 : 90);
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10.5 : 9.5);
    doc.text(label, boxX + 3, ry + 1);
    doc.text(value, boxX + boxW - 3, ry + 1, { align: 'right' });
    ry += 8.5;
  };

  if (typeof ticket.subtotal === 'number') {
    drawRow('Subtotal', formatMXN(ticket.subtotal));
  }
  if (ticket.descuento && ticket.descuento > 0) {
    drawRow('Descuento', `-${formatMXN(ticket.descuento)}`);
  }
  if (ticket.saldoAFavorAplicado && ticket.saldoAFavorAplicado > 0) {
    drawRow('Saldo a favor', `-${formatMXN(ticket.saldoAFavorAplicado)}`);
  }
  if (typeof ticket.saldoAnterior === 'number') {
    drawRow('Saldo anterior', formatMXN(ticket.saldoAnterior));
  } else {
    drawRow('Total operación', formatMXN(ticket.montoTotal), true);
  }
  drawRow(isAbono ? 'MONTO ABONADO' : 'PAGO RECIBIDO', formatMXN(ticket.pagoRecibido), true, 'gold');
  if (typeof ticket.cambio === 'number' && ticket.cambio > 0) {
    drawRow('Cambio devuelto', formatMXN(ticket.cambio));
  }
  drawRow(
    isAbono ? 'SALDO RESTANTE' : 'SALDO PENDIENTE',
    ticket.saldoPendiente <= 0 ? `${formatMXN(0)} (LIQUIDADO)` : formatMXN(ticket.saldoPendiente),
    true,
    ticket.saldoPendiente > 0 ? 'red' : 'green'
  );

  // Líneas de firma
  const sigY = Math.max(y, ry) + 20;
  const clampedSigY = Math.min(sigY, pageHeight - 36);
  doc.setDrawColor(160, 160, 170);
  doc.setLineWidth(0.35);
  doc.line(margin + 10, clampedSigY, margin + 78, clampedSigY);
  doc.line(pageWidth - margin - 78, clampedSigY, pageWidth - margin - 10, clampedSigY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 105);
  doc.text('Firma del Cliente', margin + 44, clampedSigY + 5, { align: 'center' });
  doc.text(
    encargado ? `Encargado: ${encargado}` : `Sello / Firma ${config.nombreComercial || 'Mueblería Alquia'}`,
    pageWidth - margin - 44,
    clampedSigY + 5,
    { align: 'center' }
  );

  // Pie de página editable
  doc.setDrawColor(200, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(margin, pageHeight - 22, pageWidth - margin, pageHeight - 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 17, 20);
  doc.text('¡GRACIAS POR SU PREFERENCIA!', pageWidth / 2, pageHeight - 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 105);
  doc.text(
    config.mensajeTicket || 'Conserve este comprobante para garantías y aclaraciones.',
    pageWidth / 2,
    pageHeight - 11,
    { align: 'center' }
  );

  return doc;
}

/**
 * Genera y descarga un comprobante profesional en hoja completa tamaño Carta (PDF)
 * con logo de Mueblería Alquia, detalle de la cuenta, dirección de sucursal y Encargado de tienda.
 */
function saveOrSharePdf(doc: jsPDF, filename: string): void {
  const cap =
    typeof window !== 'undefined'
      ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      : undefined;

  if (cap?.isNativePlatform?.()) {
    void (async () => {
      try {
        const [{ Filesystem, Directory }, { Share }] = await Promise.all([
          import('@capacitor/filesystem'),
          import('@capacitor/share'),
        ]);
        const dataUri = doc.output('datauristring');
        const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
        const written = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache,
        });
        await Share.share({
          title: filename,
          text: 'Comprobante digital — Mueblería Alquia',
          url: written.uri,
          dialogTitle: 'Guardar o compartir PDF',
        });
      } catch (err) {
        console.error('Error al compartir PDF en Android:', err);
        doc.save(filename);
      }
    })();
    return;
  }

  doc.save(filename);
}

export function downloadFullPageTicketPDF(
  ticket: TicketData,
  config: Pick<ConfiguracionTienda, 'nombreComercial' | 'ubicacion' | 'telefono' | 'mensajeTicket'> & {
    sucursalDireccion?: string;
    encargadoTienda?: string;
  }
): void {
  const doc = createFullPageTicketPDFDoc(ticket, config);
  const safeFolio = ticket.folio.replace(/[^a-zA-Z0-9_-]/g, '');
  const prefix =
    ticket.tipoDocumento === 'abono_credito' ||
    ticket.tipoDocumento === 'abono_apartado' ||
    ticket.tipoDocumento === 'liquidacion_apartado'
      ? 'Recibo_Abono_Alquia'
      : 'Comprobante_Alquia';
  saveOrSharePdf(doc, `${prefix}_${safeFolio}.pdf`);
}

/**
 * Genera y descarga el PDF de Corte de Caja (Venta del Día + Abonos con Nombre del Cliente y Monto Abonado)
 * ANTES de cerrar la caja y borrar las ventas del día.
 */
export function downloadCorteCajaPDF(params: {
  turno: CajaTurno;
  ventas: Venta[];
  abonos: Abono[];
  config: Pick<ConfiguracionTienda, 'nombreComercial' | 'ubicacion' | 'telefono'>;
  cerradoPorNombre: string;
  sucursal?: Sucursal | null;
  notasCierre?: string;
}): void {
  const { turno, ventas, abonos, config, cerradoPorNombre, sucursal, notasCierre } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  const summary = summarizeCajaShift(turno, ventas, abonos);
  const nowISO = new Date().toISOString();
  const storeAddress =
    turno.sucursalDireccion || sucursal?.direccion || config.ubicacion || 'Apaseo el Alto, Guanajuato';
  const encargado = turno.encargadoTienda || sucursal?.encargadoNombre || '—';

  drawStandardHeader(doc, {
    storeName: config.nombreComercial || 'Mueblería Alquia',
    storeAddress,
    storePhone: config.telefono,
    rightLabel: 'CORTE DE CAJA — CIERRE DEL DÍA',
    rightTitle: formatShortDate(nowISO),
    rightSubtitle: `Hora cierre: ${formatDateTimeMX(nowISO)}`,
  });

  let y = 55;
  doc.setTextColor(200, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REPORTE DE VENTA DEL DÍA Y ABONOS RECIBIDOS', margin, y);

  y += 6;
  doc.setFillColor(248, 248, 250);
  doc.setDrawColor(225, 225, 232);
  doc.roundedRect(margin, y, contentWidth, 24, 2.5, 2.5, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('SUCURSAL / TIENDA', margin + 4, y + 6);
  doc.text('ENCARGADO DE TIENDA', margin + 68, y + 6);
  doc.text('CAJERO / CIERRA CAJA', margin + 130, y + 6);

  doc.setTextColor(17, 17, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(turno.sucursalNombre || sucursal?.nombre || 'Tienda Principal', margin + 4, y + 11);
  doc.text(encargado, margin + 68, y + 11);
  doc.text(cerradoPorNombre || turno.abiertaPorNombre, margin + 130, y + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 90);
  doc.text(`Apertura: ${formatDateTimeMX(turno.abiertaEn)}`, margin + 4, y + 19);
  doc.text(`Fondo inicial: ${formatMXN(turno.fondoInicial)}`, margin + 68, y + 19);
  doc.text(`Total en efectivo esperado: ${formatMXN(summary.efectivoEsperadoEnCaja)}`, margin + 124, y + 19);

  y += 30;

  // Resumen KPI en 4 cajas
  const kpiW = (contentWidth - 9) / 4;
  const kpis = [
    { label: 'INGRESO VENTAS', value: formatMXN(summary.totalPagosIniciales), bg: [248, 248, 250] as const },
    { label: 'TOTAL ABONOS', value: formatMXN(summary.totalAbonos), bg: [236, 253, 245] as const },
    { label: 'TOTAL DEL DÍA', value: formatMXN(summary.totalIngresosDia), bg: [254, 248, 226] as const },
    { label: 'EFECTIVO EN CAJA', value: formatMXN(summary.efectivoEsperadoEnCaja), bg: [254, 242, 242] as const },
  ];
  kpis.forEach((k, idx) => {
    const x = margin + idx * (kpiW + 3);
    doc.setFillColor(k.bg[0], k.bg[1], k.bg[2]);
    doc.setDrawColor(225, 225, 232);
    doc.roundedRect(x, y, kpiW, 17, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 100);
    doc.text(k.label, x + 3, y + 6);
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 20);
    doc.text(k.value, x + 3, y + 13);
  });

  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 75, 85);
  doc.text(
    `Desglose por método de pago — Efectivo: ${formatMXN(summary.porMetodo.efectivo)}   |   Tarjeta: ${formatMXN(summary.porMetodo.tarjeta)}   |   Transferencia: ${formatMXN(summary.porMetodo.transferencia)}`,
    margin,
    y
  );

  y += 8;

  // SECCIÓN 1: VENTAS DEL DÍA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17, 17, 20);
  doc.text(`1. VENTAS DEL DÍA (${summary.ventasDelDia.length})`, margin, y);
  y += 4;

  const drawVentasHeader = () => {
    doc.setFillColor(17, 17, 20);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FOLIO', margin + 2.5, y + 5);
    doc.text('CLIENTE', margin + 26, y + 5);
    doc.text('TIPO', margin + 92, y + 5);
    doc.text('MÉTODO', margin + 114, y + 5);
    doc.text('TOTAL VENTA', pageWidth - margin - 34, y + 5, { align: 'right' });
    doc.text('COBRADO', pageWidth - margin - 2.5, y + 5, { align: 'right' });
    y += 7.5;
  };

  drawVentasHeader();

  if (summary.ventasDelDia.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 120);
    doc.text('Sin ventas directas registradas en este turno.', margin + 3, y + 6);
    y += 11;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    summary.ventasDelDia.forEach((v, idx) => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
        drawVentasHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 252);
        doc.rect(margin, y, contentWidth, 7, 'F');
      }
      doc.setTextColor(17, 17, 20);
      doc.text(v.folio, margin + 2.5, y + 4.8);
      const cliName = v.clienteNombre.length > 32 ? `${v.clienteNombre.slice(0, 30)}...` : v.clienteNombre;
      doc.text(cliName, margin + 26, y + 4.8);
      doc.text(v.tipo.toUpperCase(), margin + 92, y + 4.8);
      doc.text(v.metodoPago.toUpperCase(), margin + 114, y + 4.8);
      doc.text(formatMXN(v.total), pageWidth - margin - 34, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatMXN(v.pagoInicial), pageWidth - margin - 2.5, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setDrawColor(238, 238, 242);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);
      y += 7;
    });
    y += 6;
  }

  // SECCIÓN 2: ABONOS DEL DÍA (CON NOMBRE DEL CLIENTE Y CUÁNTO ABONÓ)
  if (y > pageHeight - 45) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(200, 30, 30);
  doc.text(`2. ABONOS RECIBIDOS EN EL TURNO (${summary.abonosDelDia.length})`, margin, y);
  y += 4;

  const drawAbonosHeader = () => {
    doc.setFillColor(200, 30, 30);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FOLIO', margin + 2.5, y + 5);
    doc.text('NOMBRE DEL CLIENTE', margin + 24, y + 5);
    doc.text('CUENTA / TIPO', margin + 94, y + 5);
    doc.text('MÉTODO', margin + 132, y + 5);
    doc.text('CUÁNTO ABONÓ', pageWidth - margin - 2.5, y + 5, { align: 'right' });
    y += 7.5;
  };

  drawAbonosHeader();

  if (summary.abonosDelDia.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 120);
    doc.text('Sin abonos registrados en este turno.', margin + 3, y + 6);
    y += 11;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    summary.abonosDelDia.forEach((ab, idx) => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
        drawAbonosHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(250, 250, 252);
        doc.rect(margin, y, contentWidth, 7, 'F');
      }
      doc.setTextColor(17, 17, 20);
      doc.text(ab.folio, margin + 2.5, y + 4.8);
      doc.setFont('helvetica', 'bold');
      const cliName = ab.clienteNombre.length > 34 ? `${ab.clienteNombre.slice(0, 32)}...` : ab.clienteNombre;
      doc.text(cliName, margin + 24, y + 4.8);
      doc.setFont('helvetica', 'normal');
      const tipoTxt = ab.tipoOperacion === 'credito' ? 'Crédito' : 'Apartado';
      doc.text(`${ab.operacionFolio} (${tipoTxt})`, margin + 94, y + 4.8);
      doc.text(ab.metodoPago.toUpperCase(), margin + 132, y + 4.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 128, 61);
      doc.text(formatMXN(ab.monto), pageWidth - margin - 2.5, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setDrawColor(238, 238, 242);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);
      y += 7;
    });

    // Subtotal abonos
    doc.setFillColor(254, 248, 226);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 20);
    doc.text('TOTAL ABONOS RECIBIDOS', margin + 3, y + 5.5);
    doc.text(formatMXN(summary.totalAbonos), pageWidth - margin - 2.5, y + 5.5, { align: 'right' });
    y += 12;
  }

  if (notasCierre && notasCierre.trim()) {
    if (y > pageHeight - 35) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 90);
    doc.text('OBSERVACIONES DE CIERRE:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(notasCierre.trim(), contentWidth), margin, y + 4.5);
    y += 14;
  }

  // Firmas
  if (y > pageHeight - 32) {
    doc.addPage();
    y = 30;
  } else {
    y = Math.max(y + 12, pageHeight - 34);
  }
  doc.setDrawColor(160, 160, 170);
  doc.line(margin + 8, y, margin + 76, y);
  doc.line(pageWidth - margin - 76, y, pageWidth - margin - 8, y);
  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 105);
  doc.text(`Entrega: ${cerradoPorNombre}`, margin + 42, y + 5, { align: 'center' });
  doc.text(`Recibe / Encargado: ${encargado}`, pageWidth - margin - 42, y + 5, { align: 'center' });

  const dateTag = nowISO.slice(0, 10);
  saveOrSharePdf(doc, `Corte_Caja_Alquia_${dateTag}.pdf`);
}

/**
 * Genera y descarga el PDF del Inventario completo (accesible para TODOS los usuarios registrados).
 * Contiene la fecha del inventario, la cantidad total de productos registrados y el nombre de todos los productos.
 */
export function downloadInventarioPDF(params: {
  productos: Producto[];
  inventarioSucursales: InventarioSucursal[];
  sucursales: Sucursal[];
  currentSucursalId?: string;
  config: Pick<ConfiguracionTienda, 'nombreComercial' | 'ubicacion' | 'telefono'>;
  generadoPorNombre: string;
}): void {
  const { productos, inventarioSucursales, sucursales, currentSucursalId, config, generadoPorNombre } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const nowISO = new Date().toISOString();
  const currentSucursal = sucursales.find((s) => s.id === currentSucursalId);
  const storeAddress = currentSucursal?.direccion || config.ubicacion || 'Apaseo el Alto, Guanajuato';
  const encargado = currentSucursal?.encargadoNombre || '—';

  const rows = productos.map((p) => {
    const avail = getProductStoreAvailability({
      producto: p,
      inventarioSucursales,
      sucursales,
      currentSucursalId,
    });
    return { producto: p, avail };
  });

  const totalProductosRegistrados = rows.length;
  const totalUnidadesTienda = rows.reduce((acc, r) => acc + r.avail.ownStockDisponible, 0);
  const totalApartadasTienda = rows.reduce((acc, r) => acc + r.avail.ownStockReservado, 0);

  drawStandardHeader(doc, {
    storeName: config.nombreComercial || 'Mueblería Alquia',
    storeAddress,
    storePhone: config.telefono,
    rightLabel: 'REPORTE DE INVENTARIO',
    rightTitle: formatShortDate(nowISO),
    rightSubtitle: `Elaborado: ${formatDateTimeMX(nowISO)}`,
  });

  let y = 54;
  doc.setTextColor(200, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('INVENTARIO PRIVADO DE TIENDA', margin, y);

  y += 6;
  doc.setFillColor(248, 248, 250);
  doc.setDrawColor(225, 225, 232);
  doc.roundedRect(margin, y, contentWidth, 23, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(95, 95, 105);
  doc.text('FECHA DEL INVENTARIO', margin + 4, y + 5.5);
  doc.text('TIENDA / SUCURSAL', margin + 62, y + 5.5);
  doc.text('ENCARGADO DE TIENDA', margin + 124, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17, 17, 20);
  doc.text(formatDateTimeMX(nowISO), margin + 4, y + 10.5);
  doc.text(currentSucursal?.nombre || 'Tienda Principal', margin + 62, y + 10.5);
  doc.text(encargado, margin + 124, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 80);
  doc.text(
    `Productos en esta tienda: ${totalProductosRegistrados}   |   Unidades disponibles: ${totalUnidadesTienda} (Apartadas: ${totalApartadasTienda})   |   Usuario: ${generadoPorNombre}`,
    margin + 4,
    y + 18.5
  );

  y += 28;

  const drawTableHeader = () => {
    doc.setFillColor(17, 17, 20);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.text('#', margin + 2, y + 5.3);
    doc.text('SKU', margin + 10, y + 5.3);
    doc.text('NOMBRE DEL PRODUCTO', margin + 35, y + 5.3);
    doc.text('CATEGORÍA', margin + 105, y + 5.3);
    doc.text('PRECIO', margin + 148, y + 5.3, { align: 'right' });
    doc.text('DISP.', margin + 165, y + 5.3, { align: 'right' });
    doc.text('APART.', pageWidth - margin - 2, y + 5.3, { align: 'right' });
    y += 8;
  };

  drawTableHeader();

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(110, 110, 120);
    doc.text('No hay productos registrados en el inventario todavía.', margin + 4, y + 8);
  } else {
    rows.forEach(({ producto, avail }, index) => {
      if (y > pageHeight - 24) {
        doc.addPage();
        y = 18;
        drawTableHeader();
      }
      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 252);
        doc.rect(margin, y, contentWidth, 7.5, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 110);
      doc.text(String(index + 1), margin + 2, y + 5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 17, 20);
      doc.text(producto.sku.slice(0, 14), margin + 10, y + 5);

      const nombreCorto =
        producto.nombre.length > 36 ? `${producto.nombre.slice(0, 34)}...` : producto.nombre;
      doc.text(nombreCorto, margin + 35, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 90);
      doc.text(producto.categoria.slice(0, 16), margin + 105, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(17, 17, 20);
      doc.text(formatMXN(producto.precioContado), margin + 148, y + 5, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      if (avail.ownStockDisponible <= 0) {
        doc.setTextColor(200, 30, 30);
      } else {
        doc.setTextColor(22, 128, 61);
      }
      doc.text(String(avail.ownStockDisponible), margin + 165, y + 5, { align: 'right' });

      doc.setTextColor(80, 80, 90);
      doc.setFont('helvetica', 'normal');
      doc.text(String(avail.ownStockReservado), pageWidth - margin - 2, y + 5, { align: 'right' });

      doc.setDrawColor(238, 238, 242);
      doc.line(margin, y + 7.5, pageWidth - margin, y + 7.5);
      y += 7.5;
    });

    // Resumen final
    if (y > pageHeight - 26) {
      doc.addPage();
      y = 20;
    }
    y += 4;
    doc.setFillColor(254, 248, 226);
    doc.rect(margin, y, contentWidth, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 20);
    doc.text(
      `TOTAL PRODUCTOS REGISTRADOS: ${totalProductosRegistrados}   ·   UNIDADES DISPONIBLES: ${totalUnidadesTienda}`,
      margin + 4,
      y + 6
    );
  }

  const dateTag = nowISO.slice(0, 10);
  saveOrSharePdf(doc, `Inventario_Alquia_${dateTag}.pdf`);
}
