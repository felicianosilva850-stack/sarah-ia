const fs = require("fs");
const path = require("path");

const MEMORY_DIR = path.join(__dirname, "..", "memory");
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

// ══════════════════════════════════════════
//  MEMÓRIA - GET / SAVE
// ══════════════════════════════════════════

function getMemory(chatId) {
    const safeName = chatId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const file = path.join(MEMORY_DIR, `${safeName}.json`);
    if (fs.existsSync(file)) try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
    return [];
}

function saveMemory(chatId, history) {
    const safeName = chatId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const file = path.join(MEMORY_DIR, `${safeName}.json`);
    if (history.length > 50) history = history.slice(-50);
    fs.writeFileSync(file, JSON.stringify(history, null, 2));
}

// ══════════════════════════════════════════
//  SUMARIZAÇÃO AUTOMÁTICA
// ══════════════════════════════════════════

/**
 * Quando o histórico passar de 40 mensagens, pega as 20 mais antigas,
 * cria um resumo em texto (concatenando role: content) e substitui 
 * por uma única entrada de sistema com o resumo.
 * 
 * @param {Array} history - Array de mensagens {role, content}
 * @returns {Array} - Histórico possivelmente compactado
 */
function summarizeIfNeeded(history) {
    if (history.length <= 40) return history;

    // Pega as 20 mais antigas para resumir
    const toSummarize = history.slice(0, 20);
    const remaining = history.slice(20);

    // Cria o resumo concatenando role: content
    const summaryLines = toSummarize.map(msg => `${msg.role}: ${msg.content}`);
    const summaryText = `[RESUMO DE MENSAGENS ANTERIORES]\n${summaryLines.join('\n')}`;

    // Substitui por uma única entrada de sistema
    const summaryEntry = {
        role: 'system',
        content: summaryText
    };

    return [summaryEntry, ...remaining];
}

module.exports = {
    getMemory,
    saveMemory,
    summarizeIfNeeded,
    MEMORY_DIR
};
