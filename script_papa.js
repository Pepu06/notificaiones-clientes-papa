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

// --- RUTAS EXPRESS ---

// Ruta de prueba para verificar que la app responda
app.get('/', (req, res) => res.send('✅ Servidor de Notificaciones Activo'));

app.get('/turno', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send("Link inválido.");
    try {
        const eventId = Buffer.from(token, 'base64').toString('utf-8');
        const evento = await calendar.events.get({ calendarId: CALENDAR_ID_PAPA, eventId: eventId });
        const { summary, location, start } = evento.data;
        const fecha = new Date(start.dateTime || start.date);
        fecha.setHours(fecha.getHours() - 3);
        const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        res.send(`
            <body style="font-family:sans-serif; background:#f0f2f5; display:flex; justify-content:center; padding:20px;">
                <div style="background:white; padding:30px; border-radius:15px; max-width:400px; width:100%; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="margin-top:0">Tu visita es hoy</h2>
                    <p><strong>Detalle:</strong> ${summary.split('+')[0]}</p>
                    <p><strong>Hora:</strong> ${horaStr} hs</p>
                    <p><strong>Lugar:</strong> ${location || 'Dirección acordada'}</p>
                    <a href="/accion?token=${token}&estado=CONFIRMADO" style="display:block; background:#4A9A6E; color:white; padding:15px; text-align:center; text-decoration:none; border-radius:8px; font-weight:bold; margin-top:20px;">Confirmar Asistencia</a>
                    <a href="/accion?token=${token}&estado=CANCELADO" style="display:block; background:#eee; color:#333; padding:15px; text-align:center; text-decoration:none; border-radius:8px; font-weight:bold; margin-top:10px;">Cancelar</a>
                </div>
            </body>
        `);
    } catch (e) { res.status(500).send("El turno ya no está disponible."); }
});

app.get('/accion', async (req, res) => {
    const { token, estado } = req.query;
    try {
        const eventId = Buffer.from(token, 'base64').toString('utf-8');
        await actualizarEstadoEvento(eventId, estado);
        res.send(`<h2 style="font-family:sans-serif; text-align:center; color:#4A9A6E; margin-top:50px;">¡Gracias! Estado actualizado a ${estado}.</h2>`);
    } catch (e) { res.status(500).send("Error al actualizar."); }
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
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
    
    // Ejecución de prueba 5 segundos después del arranque
    setTimeout(() => {
        enviarRecordatoriosAClientes();
    }, 5000);
});

