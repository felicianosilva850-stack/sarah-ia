const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../reminders.json');

function load() {
    try { 
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8')); 
        }
    } catch (e) { }
    return [];
}

function save(data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Erro ao salvar lembretes:", e);
    }
}

module.exports = {
    add: (chatId, timestamp, message) => {
        const r = load();
        r.push({ chatId, timestamp, message, id: Date.now() });
        save(r);
        return true;
    },
    start: (sock) => {
        setInterval(async () => {
            const r = load();
            const now = Date.now();
            const pending = r.filter(x => x.timestamp <= now);
            const future = r.filter(x => x.timestamp > now);
            
            if (pending.length > 0) {
                save(future);
                for (const item of pending) {
                    try {
                        await sock.sendMessage(item.chatId, { text: `⏰ *LEMBRETE:* ${item.message}` });
                    } catch (e) {
                        console.error("Falha ao enviar lembrete:", e);
                    }
                }
            }
        }, 30000); // Checa a cada 30 segundos
    }
};