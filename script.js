const { google } = require('googleapis');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const CALENDAR_ID = process.env.CALENDAR_ID;
const TU_NUMERO = "5491140962011"; // Tu número para el resumen

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
            await enviarWhatsApp(TU_NUMERO, "Hola! No hay eventos programados para mañana en el calendario.");
            return;
        }

        let resumenParaVos = "📅 *Resumen de turnos para mañana:*\n\n";
        console.log(`Se encontraron ${eventos.length} eventos.`);

        // 1. Procesar envíos individuales a pacientes
        for (let i = 0; i < eventos.length; i++) {
            const evento = eventos[i];
            const hora = new Date(evento.start.dateTime).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Ir armando el resumen para mandarte a vos al final
            resumenParaVos += `• ${hora}: ${evento.summary}\n`;

            const match = evento.summary.match(/\[(.*?)\]/);
            const telefono = match ? match[1].replace(/\s+/g, '') : null;

            if (telefono) {
                const mensajePaciente = `Hola! Te recordamos tu turno para mañana a las ${hora}. Por favor confirmar asistencia.`;
                await enviarWhatsApp(telefono, mensajePaciente);

                // Esperar 1 minuto entre pacientes
                if (i < eventos.length - 1) {
                    console.log(`Esperando 60 segundos para el próximo paciente...`);
                    await new Promise(resolve => setTimeout(resolve, 60000));
                }
            }
        }

        // 2. Enviarte el resumen completo a vos
        console.log("Enviando resumen al administrador...");
        await enviarWhatsApp(TU_NUMERO, resumenParaVos);

        console.log("Proceso diario finalizado correctamente.");

    } catch (error) {
        console.error("Error al leer calendario:", error);
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
                'Authorization': `Bearer ${WASENDER_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`✅ WhatsApp enviado a: ${numero}`);
    } catch (error) {
        console.error(`❌ Error enviando a ${numero}:`, error.response?.data || error.message);
    }
}

// Programado para las 10:30 AM
cron.schedule('30 11 * * *', () => {
    procesarTurnosDeMañana();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});

console.log("Bot activo. Enviará recordatorios a pacientes y resumen a tu número.");