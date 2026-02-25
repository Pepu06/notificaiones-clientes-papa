const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const WASENDER_TOKEN = process.env.WASENDER_TOKEN;
const DRAPP_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IktuWWlxNTEyNkVxOEoxeUxQc1dpTCJ9.eyJodHRwczovL2FwaS5kcmFwcC5sYS9lbWFpbCI6InR1cm5vc2NvbnN1bHRvcmlvc2FudGFmZUBnbWFpbC5jb20iLCJodHRwczovL2FwaS5kcmFwcC5sYS9zZXR0aW5ncyI6e30sImh0dHBzOi8vYXBpLmRyYXBwLmxhL3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczovL2F1dGguZHJhcHAubGEvIiwic3ViIjoiYXV0aDB8NjZlYzMxZTFkMTY3MTRjNzg1NGUyYmI2IiwiYXVkIjpbImh0dHBzOi8vYXBpLmRyYXBwLmxhIiwiaHR0cHM6Ly9kcmFwcC5hdS5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNzcxOTcyNzcxLCJleHAiOjE3NzIwNTkxNzEsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwiLCJhenAiOiJVZlhHYjVCMGV6S0hSR202ZmthYzZQVGZjd21xdGxYayIsInBlcm1pc3Npb25zIjpbXX0.m-zGdCt1YASJ02kwuzfePwZUiqKvn8alltCeADxQ0qByyFdSP9GFSqKXmywO4fD-Z90FBOcoWDkNjc-fuI1c3_gXSJ6AQZPvtJSZRQ9YNacN76N20kiF-4GjMyatyadf9GaTC5JuNZnHmZlqRq8VX3KKeycMCBkRHRe31gQ2Ucf-oLcnGIK8rdgLsadQTjDbouS4vPW29fg12geit74Gsjsb7Jss7UY39i2cM6-eJfBol2m36oqt87OkWLmmlYvFT1yhMz2vNrmFDV-cTInChJpEb7x3g-4fP4xXQq_RSEjCbGUTDecVrk_zgBDSiXvVNF9HoJmEh4K3g-zSbJPARw"; // Recordá renovarlo si expira
const MI_NUMERO = "5491140962011";

function limpiarTelefono(tel) {
    if (!tel) return null;
    return tel.replace(/\D/g, ''); // Quita todo lo que no sea número
}

async function enviarReporteControl() {
    // 1. CALCULAR RANGO EXACTO DE MAÑANA (00:00 a 23:59)
    // Usamos la fecha actual en Argentina
    const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

    // Mañana empieza a las 00:00:00
    const mañanaInicio = new Date(hoy);
    mañanaInicio.setDate(hoy.getDate() + 1);
    mañanaInicio.setHours(0, 0, 0, 0);

    // Mañana termina a las 23:59:59
    const mañanaFin = new Date(hoy);
    mañanaFin.setDate(hoy.getDate() + 1);
    mañanaFin.setHours(23, 59, 59, 999);

    console.log(`[LOG] Buscando turnos desde: ${mañanaInicio.toLocaleString()} hasta: ${mañanaFin.toLocaleString()}`);

    try {
        const response = await axios.post("https://api.drapp.la/teams/d095a09b/events/query", {
            cancelled: false,
            noshow: true,
            resource: "resources/4b706876",
            startsAt: mañanaInicio.getTime(), // Milisegundos exactos
            endsAt: mañanaFin.getTime()      // Milisegundos exactos
        }, {
            headers: {
                'Authorization': `Bearer ${DRAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const turnos = response.data;

        // Filtrar manualmente por si la API de DrApp se pasa de rango (doble seguridad)
        const turnosFiltrados = turnos.filter(t => {
            const fechaTurno = new Date(t.startsAt);
            return fechaTurno >= mañanaInicio && fechaTurno <= mañanaFin;
        });

        if (!turnosFiltrados || turnosFiltrados.length === 0) {
            await enviarWhatsApp(MI_NUMERO, "📭 *Reporte:* No hay turnos agendados para mañana.");
            return;
        }

        // 2. CONSTRUIR MENSAJE
        let mensaje = `📋 *CONTROL DE TURNOS (SOLO MAÑANA)*\n`;
        mensaje += `📅 Fecha: ${mañanaInicio.toLocaleDateString('es-AR')}\n\n`;

        // Ordenar por hora para que el reporte sea legible
        turnosFiltrados.sort((a, b) => a.startsAt - b.startsAt);

        turnosFiltrados.forEach((t, i) => {
            const nombre = t.consumer?.label || "Sin nombre";
            const hora = t.time || "--:--";
            const telefono = limpiarTelefono(t.consumer?.phone);
            if (telefono) {
                mensaje += `${i + 1}. 🕒 ${hora} - ${nombre} 📞 ${telefono}\n`;
            } else {
                mensaje += `${i + 1}. 🕒 ${hora} - ${nombre}\n`;
            }
        });

        // 3. ENVIAR A WASENDER
        await enviarWhatsApp(MI_NUMERO, mensaje);

    } catch (error) {
        console.error("Error:", error.response?.data || error.message);
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
        console.log("✅ Reporte enviado correctamente.");
    } catch (error) {
        console.error("❌ Error Wasender:", error.response?.data || error.message);
    }
}

// Programar a las 21:00 hs de Argentina
cron.schedule('0 21 * * *', () => {
    enviarReporteControl();
}, {
    timezone: "America/Argentina/Buenos_Aires"
});