// Anti-spam / Rate limiting simples
// Limite: 10 mensagens por minuto por sender

const senders = new Map();

const LIMIT = 10;
const WINDOW_MS = 60000; // 1 minuto

function isSpam(sender) {
    const now = Date.now();
    
    if (!senders.has(sender)) {
        senders.set(sender, { count: 1, firstMessage: now, warned: false });
        return false;
    }

    const data = senders.get(sender);

    // Reset se já passou a janela de 1 minuto
    if (now - data.firstMessage > WINDOW_MS) {
        senders.set(sender, { count: 1, firstMessage: now, warned: false });
        return false;
    }

    data.count++;

    if (data.count > LIMIT) {
        if (!data.warned) {
            data.warned = true;
            console.log(`[⚠️ ANTI-SPAM] Sender ${sender} bloqueado (${data.count} msgs em 1min)`);
        }
        return true;
    }

    return false;
}

// Limpeza periódica de entries antigas (a cada 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [sender, data] of senders) {
        if (now - data.firstMessage > WINDOW_MS * 2) {
            senders.delete(sender);
        }
    }
}, 300000);

module.exports = { isSpam };
