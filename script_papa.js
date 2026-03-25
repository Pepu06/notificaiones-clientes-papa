const { google } = require('googleapis');
const axios = require('axios');
const cron = require('node-cron');
const express = require('express'); // NUEVO
require('dotenv').config();

const app = express(); // NUEVO
const PORT = process.env.PORT || 3000;

const WASENDER_TOKEN_PAPA = process.env.WASENDER_TOKEN_PAPA;
const CALENDAR_ID_PAPA = process.env.CALENDAR_ID_PAPA;
const NUMERO_PAPA = "5491154773088";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_PAPA),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'], // IMPORTANTE: Se agregó el scope de events para poder editar
});

const calendar = google.calendar({ version: 'v3', auth });

// --- FUNCIONES AUXILIARES (Tus mismas funciones) ---
function filtrarEventosQueMostrar(eventos = []) {
    return eventos.filter((evento) => {
        const summary = evento.summary?.toLowerCase();
        return summary && (summary.startsWith("mostrar") || summary.startsWith("depto"));
    });
}

function obtenerFechaInicioEvento(evento) {
    return new Date(evento.start.dateTime || `${evento.start.date}T00:00:00`);
}

// --- NUEVA FUNCIÓN: Actualizar Calendario ---
async function actualizarEstadoEvento(eventId, estado) {
    try {
        // Obtenemos el evento actual
        const evento = await calendar.events.get({
            calendarId: CALENDAR_ID_PAPA,
            eventId: eventId
        });

        let summary = evento.data.summary;

        // Limpiamos estados anteriores para no duplicar (ej: "Visita - CONFIRMADO - CANCELADO")
        summary = summary.replace(' - CONFIRMADO', '').replace(' - CANCELADO', '');

        // Aplicamos el nuevo estado
        const nuevoSummary = `${summary} - ${estado}`;

        // Hacemos el PATCH para actualizar solo el título
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

// --- TUS FUNCIONES DE ENVÍO ADAPTADAS ---
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
            // Extraer celular
            const telefono = evento.summary.match(/\+\d[\d\s-]{7,}/)?.[0]?.replace(/\D/g, '') || null;
            if (!telefono) continue;

            const fecha = obtenerFechaInicioEvento(evento);
            fecha.setHours(fecha.getHours() - 3);
            const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const direccion = evento.location || "la dirección acordada";

            // Creamos un Token simple codificando el ID del evento en Base64
            const token = Buffer.from(evento.id).toString('base64');
            const linkTurno = `${BASE_URL}/turno?token=${token}`;

            const mensajePaciente = `¡Hola! Te recuerdo que te espero hoy a las ${hora} hs en ${direccion}.\n\nGonzalez Soro, servicios inmobiliarios.\n\n👉 *Por favor, confirmá o cancelá tu visita ingresando a este link de un solo uso:*\n${linkTurno}`;

            await enviarWhatsApp(telefono, mensajePaciente);
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
        console.error(`❌ Error enviando a ${numero}`);
    }
}

// --- NUEVO: RUTAS DEL SERVIDOR WEB ---

// 1. Ruta que muestra la "Card" de confirmación al cliente (similar a tu imagen)
app.get('/turno', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).send("Link inválido.");

    try {
        // Decodificamos el token para obtener el ID real
        const eventId = Buffer.from(token, 'base64').toString('utf-8');

        // Traemos los datos del evento para mostrarlos en la pantalla
        const evento = await calendar.events.get({ calendarId: CALENDAR_ID_PAPA, eventId: eventId });
        const { summary, location, start } = evento.data;

        const fecha = new Date(start.dateTime || start.date);
        fecha.setHours(fecha.getHours() - 3);
        const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        // HTML similar al diseño de tu imagen
        const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Gestionar Turno</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f7; display: flex; justify-content: center; padding: 20px; color: #333; }
                .card { background: white; border-radius: 16px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                h1 { text-align: center; font-size: 24px; margin-bottom: 5px; }
                p.subtitle { text-align: center; color: #666; margin-bottom: 24px; }
                .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
                .info-label { color: #888; }
                .info-value { font-weight: 500; text-align: right; max-width: 60%; }
                .btn { display: block; width: 100%; padding: 14px; border-radius: 8px; text-align: center; text-decoration: none; font-weight: bold; margin-top: 12px; box-sizing: border-box; }
                .btn-confirm { background-color: #4A9A6E; color: white; margin-top: 24px; }
                .btn-cancel { background-color: #f0f0f0; color: #333; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Tu turno es hoy</h1>
                <p class="subtitle">Confirmá o cancelá con un toque</p>
                
                <div class="info-row"><span class="info-label">Detalle</span><span class="info-value">${summary.split('+')[0]}</span></div>
                <div class="info-row"><span class="info-label">Horario</span><span class="info-value">${horaStr} hs</span></div>
                <div class="info-row"><span class="info-label">Dirección</span><span class="info-value">${location || 'A convenir'}</span></div>
                
                <a href="/accion?token=${token}&estado=CONFIRMADO" class="btn btn-confirm">Confirmar turno</a>
                <a href="/accion?token=${token}&estado=CANCELADO" class="btn btn-cancel">Cancelar turno</a>
            </div>
        </body>
        </html>
        `;
        res.send(html);

    } catch (error) {
        res.status(500).send("Error al cargar el turno o el link ya expiró.");
    }
});

// 2. Ruta que procesa el clic en los botones
app.get('/accion', async (req, res) => {
    const { token, estado } = req.query;
    if (!token || !estado) return res.status(400).send("Faltan parámetros.");

    try {
        const eventId = Buffer.from(token, 'base64').toString('utf-8');
        await actualizarEstadoEvento(eventId, estado);

        res.send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                <h2 style="color: #4A9A6E;">¡Listo! Tu visita fue marcada como ${estado}.</h2>
                <p>Ya podés cerrar esta pestaña.</p>
            </div>
        `);
    } catch (error) {
        res.status(500).send("Hubo un error al procesar tu solicitud.");
    }
});

// // Programamos la tarea para todos los días a las 08:00 AM hora de Argentina
// cron.schedule('0 8 * * *', async () => {
//     console.log("⏰ Ejecutando tareas programadas de las 8:00 AM...");
    
//     // Llamamos a tus funciones
//     await enviarResumenHoyAPapa();
//     await enviarRecordatoriosAClientes();
    
//     console.log("✅ Tareas de las 8 AM finalizadas.");
// }, {
//     scheduled: true,
//     timezone: "America/Argentina/Buenos_Aires" // Clave para que se ejecute a tu hora
// });


// Iniciamos el servidor web
app.listen(PORT, '0.0.0.0', () => {
    enviarRecordatoriosAClientes(); // Ejecutamos una vez al iniciar para pruebas rápidas
    console.log(`🚀 Servidor web escuchando en el puerto ${PORT}`);
    console.log("⏳ Cron job activado para las 8:00 AM (Hora Argentina)");
});

