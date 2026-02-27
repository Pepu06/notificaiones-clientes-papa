const { google } = require('googleapis');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const WASENDER_TOKEN_PAPA = process.env.WASENDER_TOKEN_PAPA;
const CALENDAR_ID_PAPA = process.env.CALENDAR_ID_PAPA;
const NUMERO_PAPA = "5491154773088"; // Tu número para el resumen

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_PAPA),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

function filtrarEventosQueMostrar(eventos = []) {
    return eventos.filter((evento) => evento.summary && evento.summary.toLowerCase().startsWith("mostrar"));
}

function obtenerFechaInicioEvento(evento) {
    return new Date(evento.start.dateTime || `${evento.start.date}T00:00:00`);
}

function obtenerHoraEvento(evento) {
    return obtenerFechaInicioEvento(evento).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function obtenerEventosEntre(timeMin, timeMax) {
    const res = await Promise.all([
        calendar.events.list({
            calendarId: CALENDAR_ID_PAPA,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        }),
    ]);

    const eventos = res[0].data.items || [];
    const todosLosEventos = filtrarEventosQueMostrar(eventos);

    console.log(`Eventos encontrados: ${todosLosEventos.length}`);
    return todosLosEventos;
}

async function enviarResumenMananaAPapa() {
    console.log("Armando resumen de mañana para papá...");

    const mananaInicio = new Date();
    mananaInicio.setDate(mananaInicio.getDate() + 1);
    mananaInicio.setHours(0, 0, 0, 0);

    const mananaFin = new Date();
    mananaFin.setDate(mananaFin.getDate() + 1);
    mananaFin.setHours(23, 59, 59, 999);

    try {
        const eventos = await obtenerEventosEntre(mananaInicio.toISOString(), mananaFin.toISOString());

        if (eventos.length === 0) {
            await enviarWhatsApp(NUMERO_PAPA, "Hola! No hay visitas agendadas para mañana.");
            return;
        }

        let resumen = "📅 *Resumen de visitas de mañana:*\n\n";
        for (const evento of eventos) {
            resumen += `• ${obtenerHoraEvento(evento)}: ${evento.summary}\n`;
        }

        await enviarWhatsApp(NUMERO_PAPA, resumen);
        console.log("Resumen diario enviado a papá.");
    } catch (error) {
        console.error("Error al enviar resumen diario:", error);
    }
}

async function enviarRecordatorios24hClientes() {
    console.log("Buscando clientes para recordar 24 horas antes...");

    const ahora = new Date();
    const ventanaInicio = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    const ventanaFin = new Date(ventanaInicio.getTime() + 15 * 60 * 1000 - 1);

    try {
        const eventos = await obtenerEventosEntre(ventanaInicio.toISOString(), ventanaFin.toISOString());

        if (eventos.length === 0) {
            console.log("No hay clientes para avisar en esta ventana de 24 horas.");
            return;
        }

        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];
            const telefono = evento.summary.match(/\+\d[\d\s-]{7,}/)?.[0]?.replace(/\D/g, '') || null;

            console.log(`Evento: ${evento.summary}, Teléfono extraído: ${telefono}`);

            if (!telefono) {
                continue;
            }

            const hora = obtenerHoraEvento(evento);
            const mensajePaciente = `Hola! Te recuerdo que te espero mañana, a las ${hora}.`;
            await enviarWhatsApp(telefono, mensajePaciente);

            if (i < eventos.length - 1) {
                console.log("Esperando 60 segundos para el próximo cliente...");
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }

        console.log("Recordatorios 24 horas enviados correctamente.");
    } catch (error) {
        console.error("Error al enviar recordatorios 24 horas:", error);
    }
}

// Función de envío genérica
async function enviarWhatsApp(numero, texto) {
    try {
        await axios.post("https://www.wasenderapi.com/api/send-message", {
            to: numero,
            text: texto
        }, {
            headers: {
                'Authorization': `Bearer ${WASENDER_TOKEN_PAPA}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ WhatsApp enviado a: ${numero}`);
    } catch (error) {
        console.error(`❌ Error enviando a ${numero}:`, error.response?.data || error.message);
    }
}

// 1) A las 20:00 todos los días: resumen de quién viene mañana a NUMERO_MAMA
cron.schedule('0 20 * * *', () => {
    enviarResumenMananaAMama();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});

// 2) Cada 15 minutos: recordatorio a clientes exactamente 24h antes
cron.schedule('*/15 * * * *', () => {
    enviarRecordatorios24hClientes();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});

console.log("Bot activo. Enviará resumen diario (20:00) y recordatorios a clientes 24h antes.");