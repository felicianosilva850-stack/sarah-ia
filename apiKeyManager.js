const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const CONFIG_PATH = path.join(__dirname, 'key.json');

// In-memory cache
let config = { gemini: [], groq: [] };

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8') || '{}';
    const parsed = JSON.parse(raw);
    return {
      gemini: Array.isArray(parsed.gemini) ? parsed.gemini : (Array.isArray(parsed.keys) ? parsed.keys : []),
      groq: Array.isArray(parsed.groq) ? parsed.groq : []
    };
  } catch (e) {
    return { gemini: [], groq: [] };
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error(chalk.red('[ERRO] apiKeyManager: Falha ao salvar key.json: ' + (e && e.message)));
    return false;
  }
}

function init() {
  config = loadConfig();
}

function getKey(provider = 'gemini') {
  const keys = config[provider];
  if (!keys || keys.length === 0) return null;
  const k = keys.shift();
  keys.push(k);
  return k;
}

function listKeys(provider = 'gemini') {
  return Array.from(config[provider] || []);
}

function markFailure(failedKey, provider = 'gemini') {
  if (!failedKey) return;
  const keys = config[provider];
  if (!keys) return;
  const idx = keys.indexOf(failedKey);
  if (idx === -1) return;
  
  keys.splice(idx, 1);
  saveConfig();
  console.log(chalk.yellow(`[AVISO] apiKeyManager: Chave ${provider} removida por falha: ${failedKey.substring(0, 8)}...`));
}

function addKey(newKey, provider = 'gemini') {
  if (!newKey || typeof newKey !== 'string') return false;
  const v = newKey.trim();
  if (!v) return false;
  if (!config[provider]) config[provider] = [];
  if (config[provider].indexOf(v) !== -1) return false; 
  config[provider].push(v);
  saveConfig();
  console.log(chalk.green(`[INFO] apiKeyManager: Nova chave ${provider} adicionada.`));
  return true;
}

init();

module.exports = { getKey, listKeys, markFailure, addKey };