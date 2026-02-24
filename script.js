const { google } = require('googleapis');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const CALENDAR_ID = process.env.CALENDAR_ID;

const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

async function procesarTurnosDeMañana() {
    console.log("Revisando Google Calendar...");

    const mañanaInicio = new Date();
    mañanaInicio.setDate(mañanaInicio.getDate() + 1);
    mañanaInicio.setHours(0, 0, 0, 0);

    const mañanaFin = new Date();
    mañanaFin.setDate(mañanaFin.getDate() + 1);
    mañanaFin.setHours(23, 59, 59, 999);

    try {
        const res = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: mañanaInicio.toISOString(),
            timeMax: mañanaFin.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const eventos = res.data.items;
        if (!eventos || eventos.length === 0) {
            console.log("No hay turnos para mañana.");
            return;
        }

        console.log(`Se encontraron ${eventos.length} turnos. Iniciando envío uno por minuto...`);

        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];
            const match = evento.summary.match(/\[(.*?)\]/);
            const telefono = match ? match[1].replace(/\s+/g, '') : null;

            if (telefono) {
                const hora = new Date(evento.start.dateTime).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                await enviarWhatsApp(telefono, hora);

                // Si NO es el último mensaje, esperamos 60 segundos
                if (i < eventos.length - 1) {
                    console.log(`Esperando 60 segundos para el próximo envío...`);
                    await new Promise(resolve => setTimeout(resolve, 60000));
                }
            }
        }
        console.log("Todos los recordatorios de mañana han sido procesados.");

    } catch (error) {
        console.error("Error al leer calendario:", error);
    }
}

async function enviarWhatsApp(numero, hora) {
    try {
        await axios.post("https://www.wasenderapi.com/api/send-message", {
            to: numero,
            text: `Hola! Te recordamos tu turno para mañana a las ${hora}. Por favor confirmar asistencia.`
        }, {
            headers: {
                'Authorization': `Bearer ${WASENDER_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ Mensaje enviado a ${numero} para las ${hora}`);
    } catch (error) {
        console.error(`❌ Error enviando a ${numero}:`, error.response?.data || error.message);
    }
}

// Programado para las 10:30 AM
cron.schedule('30 10 * * *', () => {
    procesarTurnosDeMañana();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});

console.log("Bot de recordatorios de Calendar activo (1 envío/min)...");