const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const DRAPP_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IktuWWlxNTEyNkVxOEoxeUxQc1dpTCJ9.eyJodHRwczovL2FwaS5kcmFwcC5sYS9lbWFpbCI6InR1cm5vc2NvbnN1bHRvcmlvc2FudGFmZUBnbWFpbC5jb20iLCJodHRwczovL2FwaS5kcmFwcC5sYS9zZXR0aW5ncyI6e30sImh0dHBzOi8vYXBpLmRyYXBwLmxhL3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczovL2F1dGguZHJhcHAubGEvIiwic3ViIjoiYXV0aDB8NjZlYzMxZTFkMTY3MTRjNzg1NGUyYmI2IiwiYXVkIjpbImh0dHBzOi8vYXBpLmRyYXBwLmxhIiwiaHR0cHM6Ly9kcmFwcC5hdS5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNzcxOTcyNzcxLCJleHAiOjE3NzIwNTkxNzEsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwiLCJhenAiOiJVZlhHYjVCMGV6S0hSR202ZmthYzZQVGZjd21xdGxYayIsInBlcm1pc3Npb25zIjpbXX0.m-zGdCt1YASJ02kwuzfePwZUiqKvn8alltCeADxQ0qByyFdSP9GFSqKXmywO4fD-Z90FBOcoWDkNjc-fuI1c3_gXSJ6AQZPvtJSZRQ9YNacN76N20kiF-4GjMyatyadf9GaTC5JuNZnHmZlqRq8VX3KKeycMCBkRHRe31gQ2Ucf-oLcnGIK8rdgLsadQTjDbouS4vPW29fg12geit74Gsjsb7Jss7UY39i2cM6-eJfBol2m36oqt87OkWLmmlYvFT1yhMz2vNrmFDV-cTInChJpEb7x3g-4fP4xXQq_RSEjCbGUTDecVrk_zgBDSiXvVNF9HoJmEh4K3g-zSbJPARw"; // Recordá renovarlo si expira
const MI_NUMERO = "5491140962011";

async function enviarReporteControl() {
    console.log(`[${new Date().toLocaleString()}] Generando reporte de turnos...`);

    // Rango de MAÑANA
    const mañanaInicio = new Date();
    mañanaInicio.setDate(mañanaInicio.getDate() + 1);
    mañanaInicio.setHours(0, 0, 0, 0);

    const mañanaFin = new Date();
    mañanaFin.setDate(mañanaFin.getDate() + 1);
    mañanaFin.setHours(23, 59, 59, 999);

    try {
        // 1. Obtener datos de DrApp
        const resDrapp = await axios.post("https://api.drapp.la/teams/d095a09b/events/query", {
            cancelled: false,
            noshow: true,
            resource: "resources/4b706876",
            startsAt: mañanaInicio.getTime(),
            endsAt: mañanaFin.getTime()
        }, {
            headers: {
                'Authorization': `Bearer ${DRAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const turnos = resDrapp.data;

        if (!turnos || turnos.length === 0) {
            await enviarWhatsApp(MI_NUMERO, "📭 *Reporte:* No hay turnos agendados para mañana.");
            return;
        }

        // 2. Armar el mensaje de texto
        let mensajeReporte = `📋 *RESUMEN DE TURNOS MAÑANA*\n`;
        mensajeReporte += `📅 Fecha: ${new Date(mañanaInicio).toLocaleDateString('es-AR')}\n\n`;

        turnos.forEach((t, i) => {
            const nombre = t.consumer?.label || "Sin nombre";
            const hora = t.time || "--:--";
            mensajeReporte += `${i + 1}. 🕒 ${hora} - ${nombre}\n`;
        });

        // 3. Enviar vía WASenderAPI
        await enviarWhatsApp(MI_NUMERO, mensajeReporte);

    } catch (error) {
        console.error("❌ Error en el proceso:", error.response?.data || error.message);
    }
}

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
        console.log(`✅ Reporte enviado a ${numero}`);
    } catch (error) {
        console.error(`❌ Error Wasender:`, error.response?.data || error.message);
    }
}

// Programado para las 20:00 hs de Argentina
cron.schedule('0 20 * * *', () => {
    enviarReporteControl();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});

console.log("Bot de control activo. El reporte se enviará a las 20:00 hs.");