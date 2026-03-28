const { google } = require('googleapis');
const axios = require('axios');
const cron = require('node-cron');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const WASENDER_TOKEN_PAPA = process.env.WASENDER_TOKEN_PAPA;
const CALENDAR_ID_PAPA = process.env.CALENDAR_ID_PAPA;
const NUMERO_PAPA = "5491154773088";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_PAPA),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
});

const calendar = google.calendar({ version: 'v3', auth });

function filtrarEventosQueMostrar(eventos = []) {
    return eventos.filter((evento) => {
        const summary = evento.summary?.toLowerCase();
        return summary && (summary.startsWith("mostrar") || summary.startsWith("depto"));
    });
}

function obtenerFechaInicioEvento(evento) {
    return new Date(evento.start.dateTime || `${evento.start.date}T00:00:00`);
}

async function actualizarEstadoEvento(eventId, estado) {
    try {
        const evento = await calendar.events.get({ calendarId: CALENDAR_ID_PAPA, eventId: eventId });
        let summary = evento.data.summary;
        summary = summary.replace(' - CONFIRMADO', '').replace(' - CANCELADO', '');
        const nuevoSummary = `${summary} - ${estado}`;
        await calendar.events.patch({
            calendarId: CALENDAR_ID_PAPA,
            eventId: eventId,
            requestBody: { summary: nuevoSummary }
        });
        console.log(`✅ Evento ${eventId} actualizado a: ${estado}`);
    } catch (error) {
        console.error("❌ Error actualizando evento en Calendar:", error.message);
    }
}

async function enviarResumenHoyAPapa() {
    console.log("Armando resumen de hoy para papá...");

    const mananaInicio = new Date(); mananaInicio.setHours(0, 0, 0, 0);
    const mananaFin = new Date(); mananaFin.setHours(23, 59, 59, 999);

    try {
        const res = await calendar.events.list({
            calendarId: CALENDAR_ID_PAPA,
            timeMin: mananaInicio.toISOString(),
            timeMax: mananaFin.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const eventos = filtrarEventosQueMostrar(res.data.items || []);

        if (eventos.length === 0) {
            await enviarWhatsApp(NUMERO_PAPA, "Hola! No hay visitas agendadas para hoy.");
            return;
        }

        let resumen = "📅 *Resumen de eventos de hoy:*\n\n";

        for (const evento of eventos) {
            const fecha = new Date(evento.start.dateTime || evento.start.date);
            fecha.setHours(fecha.getHours() - 3);
            const horaAjustada = fecha.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            const texto = evento.summary.toLowerCase();
            let mensajeLinea = "";

            if (texto.startsWith("mostrar")) {
                mensajeLinea = `🔑 *Visita:* ${evento.summary}`;
            } else if (texto.startsWith("depto")) {
                mensajeLinea = `🏠 *Gestión:* ${evento.summary}`;
            } else {
                mensajeLinea = evento.summary;
            }

            resumen += `• ${horaAjustada}: ${mensajeLinea}\n`;
        }

        await enviarWhatsApp(NUMERO_PAPA, resumen);
        console.log("Resumen diario enviado a papá.");
    } catch (error) {
        console.error("Error al enviar resumen diario:", error);
    }
}

async function enviarRecordatoriosAClientes() {
    console.log("Enviando recordatorios a clientes para hoy...");
    const mananaInicio = new Date(); mananaInicio.setHours(0, 0, 0, 0);
    const mananaFin = new Date(); mananaFin.setHours(23, 59, 59, 999);

    try {
        const res = await calendar.events.list({
            calendarId: CALENDAR_ID_PAPA,
            timeMin: mananaInicio.toISOString(),
            timeMax: mananaFin.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const eventos = filtrarEventosQueMostrar(res.data.items || []);

        for (const evento of eventos) {
            const telefono = evento.summary.match(/\+\d[\d\s-]{7,}/)?.[0]?.replace(/\D/g, '') || null;
            if (!telefono) continue;

            const fecha = obtenerFechaInicioEvento(evento);
            fecha.setHours(fecha.getHours());
            const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const direccion = evento.location || "la dirección acordada";

            const token = Buffer.from(evento.id).toString('base64');
            const linkTurno = `${BASE_URL}/turno?token=${token}`;

            const mensajePaciente = `¡Hola! Te recuerdo que te espero hoy a las ${hora} hs en ${direccion}.\n\nGonzalez Soro, servicios inmobiliarios.\n\n👉 *Por favor, confirmá o cancelá tu visita ingresando a este link de un solo uso:*\n${linkTurno}`;

            console.log(`Enviando recordatorio a ${telefono} para evento "${evento.summary}"...`);
            await enviarWhatsApp(telefono, mensajePaciente);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    } catch (error) {
        console.error("Error al enviar recordatorios:", error);
    }
}

async function enviarWhatsApp(numero, texto) {
    try {
        await axios.post("https://www.wasenderapi.com/api/send-message", {
            to: numero, text: texto
        }, { headers: { 'Authorization': `Bearer ${WASENDER_TOKEN_PAPA}`, 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error(`❌ Error enviando a ${numero}:`, error.response?.status, error.response?.data || error.message);
    }
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

const CSS = `
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --green:#1a9e6e;--green-light:#e8f8f2;--green-dark:#0f6e4c;
    --red:#e05252;--red-light:#fdf0f0;
    --gray-50:#f9f9f8;--gray-100:#f0efec;--gray-200:#e2e0db;
    --gray-400:#9e9b94;--gray-700:#3d3c38;--gray-900:#1a1917;
    --radius:14px;--radius-sm:8px;
  }
  body{font-family:'DM Sans',sans-serif;background:var(--gray-50);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem 1rem;color:var(--gray-900)}
  .container{width:100%;max-width:400px}
  .header{text-align:center;margin-bottom:1.75rem}
  .badge{display:inline-flex;align-items:center;gap:7px;background:white;border:1px solid var(--gray-200);border-radius:99px;padding:6px 14px 6px 8px;font-size:13px;color:var(--gray-700);font-weight:500;margin-bottom:1.25rem}
  .badge-dot{width:22px;height:22px;background:var(--green);border-radius:50%;display:flex;align-items:center;justify-content:center}
  .badge-dot svg{width:11px;height:11px}
  h1{font-family:'DM Serif Display',serif;font-size:26px;font-weight:400;line-height:1.25;color:var(--gray-900);margin-bottom:6px}
  .subtitle{font-size:14px;color:var(--gray-400)}
  .card{background:white;border-radius:var(--radius);border:1px solid var(--gray-200);padding:1.5rem}
  .info-row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--gray-100);gap:1rem}
  .info-row:last-of-type{border-bottom:none;margin-bottom:1.5rem}
  .info-key{font-size:13px;color:var(--gray-400);white-space:nowrap}
  .info-val{font-size:14px;font-weight:500;color:var(--gray-700);text-align:right}
  .tag{display:inline-block;background:var(--green-light);color:var(--green-dark);font-size:12px;font-weight:500;padding:3px 10px;border-radius:99px}
  .divider{height:1px;background:var(--gray-100);margin:0 -1.5rem 1.5rem}
  .actions{display:flex;flex-direction:column;gap:10px}
  .btn{display:block;width:100%;padding:14px;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:15px;font-weight:500;text-align:center;text-decoration:none;transition:all .15s ease}
  .btn-confirm{background:var(--green);color:white}
  .btn-confirm:hover{background:var(--green-dark)}
  .btn-cancel{background:var(--gray-100);color:var(--gray-700)}
  .btn-cancel:hover{background:var(--gray-200)}
  .footer-note{text-align:center;font-size:12px;color:var(--gray-400);margin-top:1.25rem;line-height:1.6}
  .result{padding:1rem 0 0.5rem;text-align:center}
  .result-icon{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0.5rem auto 1.25rem}
  .result-icon.ok{background:var(--green-light)}
  .result-icon.cancel{background:var(--red-light)}
  .result-icon svg{width:26px;height:26px}
  .result h2{font-family:'DM Serif Display',serif;font-size:22px;font-weight:400;margin-bottom:8px;color:var(--gray-900)}
  .result p{font-size:14px;color:var(--gray-400);line-height:1.6}
</style>`;

const ICONO_MAS = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
const ICONO_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="#1a9e6e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICONO_CRUZ = `<svg viewBox="0 0 24 24" fill="none" stroke="#e05252" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function pagina(contenido, titulo = 'Tu turno') {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${titulo}</title>
  ${CSS}
</head>
<body>
  <div class="container">${contenido}</div>
</body>
</html>`;
}

function badge() {
    return `<div class="badge"><div class="badge-dot">${ICONO_MAS}</div>González Soro · Inmobiliaria</div>`;
}

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.send('✅ Servidor de Notificaciones Activo'));

app.get('/turno', async (req, res) => {
    const { token } = req.query;

    if (!token) return res.send(pagina(`
        <div class="header">${badge()}<h1>Link inválido</h1><p class="subtitle">Este link no es válido o ya expiró.</p></div>
    `));

    try {
        const eventId = Buffer.from(token, 'base64').toString('utf-8');
        const evento = await calendar.events.get({ calendarId: CALENDAR_ID_PAPA, eventId });
        const { summary, location, start } = evento.data;

        const fecha = new Date(start.dateTime || start.date);
        fecha.setHours(fecha.getHours() - 3);
        const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const fechaStr = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
        const detalle = summary.split('+')[0].trim();
        const lugar = location || 'Dirección acordada';

        if (summary.includes('- CONFIRMADO')) return res.send(pagina(`
            <div class="header">${badge()}<h1>Ya respondiste<br>este turno</h1></div>
            <div class="card">
              <div class="result">
                <div class="result-icon ok">${ICONO_CHECK}</div>
                <h2>Turno confirmado</h2>
                <p>El ${fechaStr} a las ${horaStr} hs.<br>¡Te esperamos!</p>
              </div>
            </div>
        `));

        if (summary.includes('- CANCELADO')) return res.send(pagina(`
            <div class="header">${badge()}<h1>Ya respondiste<br>este turno</h1></div>
            <div class="card">
              <div class="result">
                <div class="result-icon cancel">${ICONO_CRUZ}</div>
                <h2>Turno cancelado</h2>
                <p>Si querés reprogramar,<br>comunicate con nosotros.</p>
              </div>
            </div>
        `));

        res.send(pagina(`
            <div class="header">
              ${badge()}
              <h1>Tu visita es<br>hoy</h1>
              <p class="subtitle">Confirmá o cancelá con un toque</p>
            </div>
            <div class="card">
              <div class="info-row"><span class="info-key">Fecha</span><span class="info-val">${fechaStr}</span></div>
              <div class="info-row"><span class="info-key">Horario</span><span class="info-val">${horaStr} hs</span></div>
              <div class="info-row"><span class="info-key">Detalle</span><span class="info-val"><span class="tag">${detalle}</span></span></div>
              <div class="info-row"><span class="info-key">Dirección</span><span class="info-val">${lugar}</span></div>
              <div class="divider"></div>
              <div class="actions">
                <a href="/accion?token=${token}&estado=CONFIRMADO" class="btn btn-confirm">Confirmar visita</a>
                <a href="/accion?token=${token}&estado=CANCELADO"  class="btn btn-cancel">Cancelar visita</a>
              </div>
            </div>
            <p class="footer-note">Este link es de uso único y expira<br>luego de ser utilizado.</p>
        `));

    } catch (e) {
        console.error(e);
        res.status(500).send(pagina(`
            <div class="header">${badge()}<h1>Algo salió mal</h1><p class="subtitle">No pudimos cargar tu turno.<br>Comunicate con nosotros.</p></div>
        `));
    }
});

app.get('/accion', async (req, res) => {
    const { token, estado } = req.query;
    if (!token || !estado) return res.status(400).send('Parámetros inválidos.');

    try {
        const eventId = Buffer.from(token, 'base64').toString('utf-8');
        await actualizarEstadoEvento(eventId, estado);

        const esConfirmado = estado === 'CONFIRMADO';

        res.send(pagina(`
            <div class="header">
              ${badge()}
              <h1>${esConfirmado ? '¡Gracias por<br>confirmar!' : 'Visita<br>cancelada'}</h1>
            </div>
            <div class="card">
              <div class="result">
                <div class="result-icon ${esConfirmado ? 'ok' : 'cancel'}">
                  ${esConfirmado ? ICONO_CHECK : ICONO_CRUZ}
                </div>
                <h2>${esConfirmado ? '¡Nos vemos hoy!' : 'Entendido'}</h2>
                <p>${esConfirmado
                ? 'Tu visita quedó confirmada.<br>El equipo ya fue notificado.'
                : 'Tu visita fue cancelada.<br>Si querés reprogramar, comunicate<br>con nosotros.'
            }</p>
              </div>
            </div>
            <p class="footer-note">Podés cerrar esta ventana.</p>
        `));
    } catch (e) {
        console.error(e);
        res.status(500).send(pagina(`
            <div class="header">${badge()}<h1>Error al actualizar</h1><p class="subtitle">Por favor intentá de nuevo<br>o comunicate con nosotros.</p></div>
        `));
    }
});

// ─── Cron y arranque ──────────────────────────────────────────────────────────

cron.schedule('0 8 * * *', async () => {
    console.log("⏰ Ejecutando tareas de las 8:00 AM...");
    await enviarResumenHoyAPapa();
    await new Promise(resolve => setTimeout(resolve, 5000));
    await enviarRecordatoriosAClientes();
    console.log("✅ Tareas finalizadas.");
}, {
    scheduled: true,
    timezone: "America/Argentina/Buenos_Aires"
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});

