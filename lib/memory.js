const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const MEMORY_DIR = path.join(__dirname, "..", "memory");
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);

const dbPath = path.join(MEMORY_DIR, 'chats.db');
const db = new DatabaseSync(dbPath);

// Cria as tabelas se não existirem
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// ══════════════════════════════════════════
//  MEMÓRIA - GET / SAVE
// ══════════════════════════════════════════

function getMemory(chatId) {
    try {
        const stmt = db.prepare('SELECT role, content FROM messages WHERE chatId = ? ORDER BY id ASC');
        return stmt.all(chatId);
    } catch (e) {
        console.error('Error reading memory from SQLite:', e);
        return [];
    }
}

function saveMemory(chatId, history) {
    try {
        // Limpa o histórico atual do chatId
        const deleteStmt = db.prepare('DELETE FROM messages WHERE chatId = ?');
        deleteStmt.run(chatId);
        
        // Se o histórico for muito longo, corta para as últimas 300 mensagens
        let toSave = history;
        if (toSave.length > 300) {
            toSave = toSave.slice(-300);
        }
        
        const insertStmt = db.prepare('INSERT INTO messages (chatId, role, content) VALUES (?, ?, ?)');
        for (const msg of toSave) {
            insertStmt.run(chatId, msg.role, msg.content);
        }
    } catch (e) {
        console.error('Error saving memory to SQLite:', e);
    }
}

// ══════════════════════════════════════════
//  SUMARIZAÇÃO AUTOMÁTICA
// ══════════════════════════════════════════

/**
 * Quando o histórico passar de 300 mensagens, pega as 100 mais antigas,
 * cria um resumo em texto (concatenando role: content) e substitui 
 * por uma única entrada de sistema com o resumo.
 * 
 * @param {Array} history - Array de mensagens {role, content}
 * @returns {Array} - Histórico possivelmente compactado
 */
function summarizeIfNeeded(history) {
    // Aumentado o limite de 40 para 300 mensagens!
    if (history.length <= 300) return history;

    // Pega as 100 mais antigas para resumir (sobrando 200)
    const toSummarize = history.slice(0, 100);
    const remaining = history.slice(100);

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
