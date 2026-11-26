import React, { useEffect, useState } from 'react';
import { Check, Copy, FileDown, Mail, MessageCircle, Send, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';
import {
  buildWhatsAppLink,
  buildWhatsAppTicketText,
  formatMXN,
  formatShortDate,
} from '../utils/finance';
import {
  buildReceiptEmailPayload,
  dispatchReceiptEmailViaEmailJS,
  downloadFullPageTicketPDF,
} from '../utils/pdfTicket';

const DOC_TITLES = {
  venta_contado: 'VENTA DE CONTADO',
  venta_credito: 'VENTA A CRÉDITO',
  apartado: 'COMPROBANTE DE APARTADO',
  abono_credito: 'RECIBO DE ABONO — CRÉDITO',
  abono_apartado: 'RECIBO DE ABONO — APARTADO',
  liquidacion_apartado: 'LIQUIDACIÓN DE APARTADO',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function TicketModal() {
  const { activeTicket, setActiveTicket, configuracion, currentSucursal, notify } = useStore();
  const [copied, setCopied] = useState(false);
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (activeTicket) {
      setRecipientEmail(activeTicket.clienteEmail || '');
      setEmailPanelOpen(false);
    }
  }, [activeTicket]);

  if (!activeTicket) return null;

  const isAbono =
    activeTicket.tipoDocumento === 'abono_credito' ||
    activeTicket.tipoDocumento === 'abono_apartado' ||
    activeTicket.tipoDocumento === 'liquidacion_apartado';

  const storeAddress =
    activeTicket.sucursalDireccion || currentSucursal?.direccion || configuracion.ubicacion;
  const encargadoTienda =
    activeTicket.encargadoTienda || currentSucursal?.encargadoNombre || '';
  const sucursalNombre = activeTicket.sucursalNombre || currentSucursal?.nombre || '';

  const mergedStoreHeader = {
    ...configuracion,
    sucursalNombre,
    sucursalDireccion: storeAddress,
    encargadoTienda,
  };

  const whatsappText = buildWhatsAppTicketText(activeTicket, mergedStoreHeader);
  const whatsappUrl = buildWhatsAppLink(activeTicket.clienteTelefono, whatsappText);
  const emailPayload = buildReceiptEmailPayload(activeTicket, mergedStoreHeader, recipientEmail);
  const hasAutoEmailJS = Boolean(
    configuracion.emailjsServiceId?.trim() &&
      configuracion.emailjsTemplateId?.trim() &&
      configuracion.emailjsPublicKey?.trim()
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopied(true);
      notify('Resumen del comprobante copiado al portapapeles.');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logAppError({ source: 'operacion', action: 'copyTicketText', error: err });
      notify('No se pudo copiar automáticamente.', 'error');
    }
  };

  const handleDownloadPDF = () => {
    try {
      downloadFullPageTicketPDF(activeTicket, mergedStoreHeader);
      notify(`Recibo digital PDF (${activeTicket.folio}) descargado.`);
    } catch (err) {
      logAppError({
        source: 'operacion',
        action: 'downloadFullPageTicketPDF',
        error: err,
        context: { folio: activeTicket.folio },
      });
      notify(formatFriendlyErrorMessage(err), 'error');
    }
  };

  const handleSendEmail = async (e: React.FormEvent, alsoDownloadPdf = false) => {
    e.preventDefault();
    const cleanEmail = recipientEmail.trim();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      const valErr = new Error('Ingresa un correo electrónico válido del cliente (ej. cliente@correo.com).');
      logAppError({
        source: 'validacion',
        severity: 'warning',
        action: 'sendReceiptEmail',
        error: valErr,
        context: { folio: activeTicket.folio, recipientEmail: cleanEmail },
      });
      notify(valErr.message, 'error');
      return;
    }

    setSendingEmail(true);
    try {
      if (alsoDownloadPdf) {
        downloadFullPageTicketPDF(activeTicket, mergedStoreHeader);
      }

      const payload = buildReceiptEmailPayload(activeTicket, mergedStoreHeader, cleanEmail);

      if (hasAutoEmailJS) {
        const res = await dispatchReceiptEmailViaEmailJS({
          serviceId: configuracion.emailjsServiceId,
          templateId: configuracion.emailjsTemplateId,
          publicKey: configuracion.emailjsPublicKey,
          payload,
          ticket: activeTicket,
        });
        if (res.sent) {
          notify(`Recibo ${activeTicket.folio} enviado por correo a ${cleanEmail}.`);
          setEmailPanelOpen(false);
          return;
        }
        if (res.error) {
          logAppError({
            source: 'operacion',
            severity: 'warning',
            action: 'dispatchReceiptEmailViaEmailJS',
            error: new Error(res.error),
            context: { folio: activeTicket.folio, to: cleanEmail },
          });
        }
      }

      // Apertura segura de cliente de correo con recibo prellenado (sin usar window.open)
      const anchor = document.createElement('a');
      anchor.href = payload.mailtoUrl;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      notify(
        alsoDownloadPdf
          ? `PDF descargado y correo prellenado para ${cleanEmail}. Adjunta el PDF y envía.`
          : `Correo prellenado abierto para ${cleanEmail}.`
      );
    } catch (err) {
      logAppError({
        source: 'operacion',
        action: 'sendReceiptEmail',
        error: err,
        context: { folio: activeTicket.folio, to: cleanEmail },
      });
      notify(formatFriendlyErrorMessage(err), 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Recibo digital PDF, WhatsApp y Correo"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111114] text-white border-b-2 border-[#C81E1E]">
          <div>
            <h2 className="text-lg font-display font-bold">
              {isAbono ? 'Recibo digital de abono' : 'Comprobante'} · {activeTicket.folio}
            </h2>
            <p className="text-xs text-zinc-300">
              Descarga en PDF o envíalo directamente al cliente por WhatsApp o correo electrónico
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTicket(null)}
            aria-label="Cerrar comprobante"
            className="p-2 rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[68vh] overflow-y-auto">
          {/* Vista previa con Logotipo Oficial Mueblería Alquia, Detalle de Cuenta, Monto Abonado y Saldo Restante */}
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Vista previa del recibo digital
            </span>
            <div className="w-full max-w-[310px] bg-white text-black border border-dashed border-zinc-300 rounded-xl p-4 font-mono text-[11px] leading-relaxed shadow-inner">
              <div className="text-center border-b border-dashed border-zinc-400 pb-2.5 mb-2.5">
                <img
                  src="/alquia-ticket-logo.svg"
                  alt="Logo Mueblería Alquia"
                  className="h-14 w-auto mx-auto mb-1.5 object-contain"
                />
                <div className="font-bold text-xs tracking-wide uppercase">
                  {configuracion.nombreComercial}
                </div>
                {sucursalNombre && (
                  <div className="text-[10px] font-semibold text-zinc-700">{sucursalNombre}</div>
                )}
                <div className="text-[10px]">{storeAddress}</div>
                {configuracion.telefono && (
                  <div className="text-[10px]">Tel: {configuracion.telefono}</div>
                )}
              </div>

              <div className="text-center font-bold text-xs mb-2">
                {DOC_TITLES[activeTicket.tipoDocumento]}
              </div>

              <div className="space-y-0.5 text-[10.5px] border-b border-dashed border-zinc-400 pb-2 mb-2">
                <div className="flex justify-between">
                  <span>Folio:</span>
                  <span className="font-bold">{activeTicket.folio}</span>
                </div>
                {activeTicket.referenciaFolio && (
                  <div className="flex justify-between">
                    <span>Cuenta:</span>
                    <span className="font-bold">{activeTicket.referenciaFolio}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Fecha:</span>
                  <span>{formatShortDate(activeTicket.fechaISO)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Cliente:</span>
                  <span className="text-right font-semibold truncate">{activeTicket.clienteNombre}</span>
                </div>
                {activeTicket.clienteTelefono && (
                  <div className="flex justify-between">
                    <span>WhatsApp:</span>
                    <span>{activeTicket.clienteTelefono}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span>Atendió:</span>
                  <span className="text-right truncate">{activeTicket.atendidoPor}</span>
                </div>
                {encargadoTienda && (
                  <div className="flex justify-between gap-2">
                    <span>Encargado:</span>
                    <span className="text-right font-semibold truncate">{encargadoTienda}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Pago:</span>
                  <span className="uppercase">{activeTicket.metodoPago}</span>
                </div>
                {activeTicket.estadoPuntualidad && (
                  <div className="flex justify-between font-bold pt-0.5">
                    <span>Estado:</span>
                    <span>
                      {activeTicket.estadoPuntualidad === 'atrasado'
                        ? `ATRASADO (${activeTicket.diasAtraso || 1}d)`
                        : 'AL DÍA'}
                    </span>
                  </div>
                )}
              </div>

              {/* Detalle de la cuenta del cliente (para abonos) */}
              {(activeTicket.cuentaConcepto || typeof activeTicket.cuentaTotal === 'number') && (
                <div className="border-b border-dashed border-zinc-400 pb-2 mb-2 space-y-0.5 text-[10.5px]">
                  <div className="font-bold text-[10px] uppercase text-[#C81E1E]">
                    Detalle de la cuenta
                  </div>
                  {activeTicket.cuentaConcepto && (
                    <div className="text-zinc-800 font-semibold">{activeTicket.cuentaConcepto}</div>
                  )}
                  {typeof activeTicket.cuentaTotal === 'number' && (
                    <div className="flex justify-between">
                      <span>Total cuenta:</span>
                      <span>{formatMXN(activeTicket.cuentaTotal)}</span>
                    </div>
                  )}
                  {typeof activeTicket.cuentaTotalAbonado === 'number' && (
                    <div className="flex justify-between">
                      <span>Acumulado abonado:</span>
                      <span className="font-semibold text-emerald-700">
                        {formatMXN(activeTicket.cuentaTotalAbonado)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {activeTicket.items && activeTicket.items.length > 0 && (
                <div className="border-b border-dashed border-zinc-400 pb-2 mb-2 space-y-1">
                  <div className="font-bold text-[10px] uppercase">Artículos</div>
                  {activeTicket.items.map((item, idx) => (
                    <div key={`${item.productoId}-${idx}`} className="text-[10.5px]">
                      <div className="font-semibold">
                        {item.cantidad}x {item.nombre}
                      </div>
                      <div className="flex justify-between text-zinc-700">
                        <span>{item.sku}</span>
                        <span>{formatMXN(item.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 text-[11px] border-b border-dashed border-zinc-400 pb-2 mb-2">
                {typeof activeTicket.subtotal === 'number' && (
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatMXN(activeTicket.subtotal)}</span>
                  </div>
                )}
                {activeTicket.descuento ? (
                  <div className="flex justify-between">
                    <span>Descuento:</span>
                    <span>-{formatMXN(activeTicket.descuento)}</span>
                  </div>
                ) : null}
                {activeTicket.saldoAFavorAplicado ? (
                  <div className="flex justify-between">
                    <span>Saldo a favor:</span>
                    <span>-{formatMXN(activeTicket.saldoAFavorAplicado)}</span>
                  </div>
                ) : null}
                {typeof activeTicket.saldoAnterior === 'number' ? (
                  <div className="flex justify-between">
                    <span>Saldo anterior:</span>
                    <span>{formatMXN(activeTicket.saldoAnterior)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span>{formatMXN(activeTicket.montoTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xs text-emerald-800">
                  <span>{isAbono ? 'Monto abonado:' : 'Pago recibido:'}</span>
                  <span>{formatMXN(activeTicket.pagoRecibido)}</span>
                </div>
                {typeof activeTicket.cambio === 'number' && activeTicket.cambio > 0 && (
                  <div className="flex justify-between">
                    <span>Cambio:</span>
                    <span>{formatMXN(activeTicket.cambio)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#C81E1E]">
                  <span>{isAbono ? 'Saldo restante:' : 'Saldo pendiente:'}</span>
                  <span>{formatMXN(activeTicket.saldoPendiente)}</span>
                </div>
              </div>

              {activeTicket.proximoPagoFecha && activeTicket.saldoPendiente > 0 && (
                <div className="text-[10.5px] font-bold mb-1">
                  Próximo pago: {formatShortDate(activeTicket.proximoPagoFecha)}
                </div>
              )}
              {activeTicket.planInfo && (
                <div className="text-[10px] mb-1">Plan: {activeTicket.planInfo}</div>
              )}
              {activeTicket.fechaLimite && activeTicket.saldoPendiente > 0 && (
                <div className="text-[10px] font-semibold mb-1">
                  Fecha límite: {formatShortDate(activeTicket.fechaLimite)}
                </div>
              )}
              {activeTicket.notas && (
                <div className="text-[10px] mb-2">Notas: {activeTicket.notas}</div>
              )}

              <div className="text-center text-[10px] pt-1">
                ¡Gracias por su preferencia!
                <div className="text-[9px] text-zinc-600 mt-0.5">
                  {configuracion.mensajeTicket}
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Text, Correo Electrónico y PDF Info */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Mensaje listo para WhatsApp
              </span>
              <pre className="flex-1 whitespace-pre-wrap rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-y-auto max-h-[260px]">
                {whatsappText}
              </pre>
            </div>

            {/* Panel de envío directo por correo electrónico */}
            {emailPanelOpen && (
              <form
                onSubmit={(e) => void handleSendEmail(e, false)}
                className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-[#D4A329]/60 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="ticket-recipient-email"
                    className="text-xs font-extrabold text-[#111114] dark:text-white flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#C81E1E]" />
                    Enviar recibo por correo electrónico
                  </label>
                  <button
                    type="button"
                    onClick={() => setEmailPanelOpen(false)}
                    aria-label="Cerrar panel de correo"
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  id="ticket-recipient-email"
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="correo.cliente@ejemplo.com"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141418] border border-zinc-300 dark:border-zinc-700 text-xs focus:outline-none focus:ring-2 focus:ring-[#C81E1E]"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={sendingEmail}
                    className="alquia-gold-btn flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-extrabold disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendingEmail
                      ? 'Enviando...'
                      : hasAutoEmailJS
                        ? 'Enviar correo directo'
                        : 'Abrir correo prellenado'}
                  </button>
                  <button
                    type="button"
                    disabled={sendingEmail}
                    onClick={(e) => void handleSendEmail(e, true)}
                    className="alquia-gold-outline-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold disabled:opacity-60"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    PDF + Correo
                  </button>
                </div>
                <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  Asunto: <span className="font-semibold">{emailPayload.subject}</span>
                </p>
              </form>
            )}

            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200">
              <strong className="text-[#C81E1E] dark:text-red-400">Recibo digital PDF:</strong>{' '}
              Incluye el logotipo de {configuracion.nombreComercial}, detalle completo de la cuenta del cliente, monto abonado, saldo restante y firma.
            </div>
          </div>
        </div>

        {/* Footer Actions — Sin opción de imprimir: Copiar, Correo, WhatsApp y Descargar PDF */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
          <button
            type="button"
            onClick={handleCopy}
            className="alquia-gold-outline-btn inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>

          <button
            type="button"
            onClick={() => setEmailPanelOpen((v) => !v)}
            className="alquia-gold-outline-btn inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold"
          >
            <Mail className="w-4 h-4" />
            Enviar por correo
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
          >
            <MessageCircle className="w-4 h-4" />
            Enviar por WhatsApp
          </a>

          <button
            type="button"
            onClick={handleDownloadPDF}
            className="alquia-gold-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
          >
            <FileDown className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
