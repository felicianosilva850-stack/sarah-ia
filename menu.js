const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const SESSION_DIR = path.join(__dirname, 'yusril');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (e) {}
    return { provider: 'gemini' };
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function clearScreen() {
    console.clear();
    console.log(`
╔══════════════════════════════════╗
║        MENU DE CONTROLE IA       ║
╚══════════════════════════════════╝
    `);
}

function getCurrentModel(settings) {
    switch (settings.provider) {
        case 'groq': return settings.groqModel || 'llama-3.3-70b-versatile';
        case 'gemini': return settings.geminiModel || 'gemini-1.5-flash';
        case 'ollama': return settings.ollamaModel || 'qwen:8b';
        case 'openrouter': return settings.openrouterModel || 'google/gemini-2.5-flash';
        default: return 'desconhecido';
    }
}

function showMenu() {
    clearScreen();
    const settings = loadSettings();
    console.log(`Provedor Atual: [ ${settings.provider.toUpperCase()} ]`);
    console.log(`Modelo Atual:   [ ${getCurrentModel(settings)} ]\n`);
    console.log('1. Mudar para Groq');
    console.log('2. Mudar para Gemini');
    console.log('3. Mudar para Ollama');
    console.log('4. Mudar para OpenRouter');
    console.log('5. Ver/Trocar Modelo');
    console.log('6. Apagar Sessão do WhatsApp (QR Code)');
    console.log('7. Iniciar o Bot');
    console.log('8. Sair\n');

    rl.question('Escolha uma opção: ', (answer) => {
        switch (answer.trim()) {
            case '1':
                settings.provider = 'groq';
                saveSettings(settings);
                console.log('\n✅ Provedor alterado para Groq!');
                setTimeout(showMenu, 1500);
                break;
            case '2':
                settings.provider = 'gemini';
                saveSettings(settings);
                console.log('\n✅ Provedor alterado para Gemini!');
                setTimeout(showMenu, 1500);
                break;
            case '3':
                settings.provider = 'ollama';
                saveSettings(settings);
                console.log('\n✅ Provedor alterado para Ollama!');
                setTimeout(showMenu, 1500);
                break;
            case '4':
                settings.provider = 'openrouter';
                saveSettings(settings);
                console.log('\n✅ Provedor alterado para OpenRouter!');
                setTimeout(showMenu, 1500);
                break;
            case '5':
                console.log(`\nProvedor: ${settings.provider.toUpperCase()}`);
                console.log(`Modelo atual: ${getCurrentModel(settings)}`);
                rl.question('\nDigite o novo modelo (ou Enter para manter): ', (model) => {
                    model = model.trim();
                    if (model) {
                        switch (settings.provider) {
                            case 'groq': settings.groqModel = model; break;
                            case 'gemini': settings.geminiModel = model; break;
                            case 'ollama': settings.ollamaModel = model; break;
                            case 'openrouter': settings.openrouterModel = model; break;
                        }
                        saveSettings(settings);
                        console.log(`\n✅ Modelo alterado para: ${model}`);
                    } else {
                        console.log('\nModelo mantido.');
                    }
                    setTimeout(showMenu, 1500);
                });
                break;
            case '6':
                try {
                    if (fs.existsSync(SESSION_DIR)) {
                        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                        console.log('\n🗑️ Sessão apagada com sucesso! O bot pedirá um novo pareamento na próxima inicialização.');
                    } else {
                        console.log('\n⚠️ A pasta de sessão já está vazia.');
                    }
                } catch (e) {
                    console.log('\n❌ Erro ao apagar a sessão:', e.message);
                }
                setTimeout(showMenu, 2500);
                break;
            case '7':
                console.log('\n🚀 Iniciando o bot...\n');
                rl.close();
                try {
                    // Executa o bot substituindo o processo atual do menu
                    require('./index.js');
                } catch (e) {
                    console.error('Erro ao iniciar:', e);
                }
                break;
            case '8':
                console.log('\nSaindo...');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('\n❌ Opção inválida!');
                setTimeout(showMenu, 1500);
                break;
        }
    });
}

showMenu();
