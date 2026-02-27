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

async function enviarRecordatoriosAClientes() {
    console.log("Enviando recordatorios a clientes para mañana...");

    const mananaInicio = new Date();
    mananaInicio.setDate(mananaInicio.getDate() + 1);
    mananaInicio.setHours(0, 0, 0, 0);

    const mananaFin = new Date();
    mananaFin.setDate(mananaFin.getDate() + 1);
    mananaFin.setHours(23, 59, 59, 999);

    try {
        const eventos = await obtenerEventosEntre(mananaInicio.toISOString(), mananaFin.toISOString());

        if (eventos.length === 0) {
            console.log("No hay clientes para avisar mañana.");
            return;
        }

        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];
            const telefono = evento.summary.match(/\+\d[\d\s-]{7,}/)?.[0]?.replace(/\D/g, '') || null;

            if (!telefono) {
                continue;
            }

            const hora = obtenerHoraEvento(evento);
            const direccion = evento.location || "la dirección acordada";
            const mensajePaciente = `Hola! Te recuerdo que te espero hoy, a las ${hora}\nen ${direccion}. \n\nGonzalez Soro, servicios inmobiliarios.\n\n_Por favor *reacciona* con un "👍" para confirmar._`;
            await enviarWhatsApp(telefono, mensajePaciente);

            if (i < eventos.length - 1) {
                console.log("Esperando 60 segundos para el próximo cliente...");
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }

        console.log("Recordatorios enviados correctamente.");
    } catch (error) {
        console.error("Error al enviar recordatorios:", error);
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

// A las 8:00 AM todos los días: resumen de mañana + recordatorios a clientes
cron.schedule('0 8 * * *', async () => {
    await enviarRecordatoriosAClientes();
    await new Promise(resolve => setTimeout(resolve, 60000));
    enviarResumenMananaAPapa();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});

console.log("Bot activo. Enviará resumen y recordatorios a las 8:00 AM para los eventos de mañana.");