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

function showMenu() {
    clearScreen();
    const settings = loadSettings();
    console.log(`Provedor Atual: [ ${settings.provider.toUpperCase()} ]\n`);
    console.log('1. Mudar para Groq');
    console.log('2. Mudar para Gemini');
    console.log('3. Apagar Sessão do WhatsApp (QR Code)');
    console.log('4. Iniciar o Bot');
    console.log('5. Sair\n');

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
            case '4':
                console.log('\n🚀 Iniciando o bot...\n');
                rl.close();
                try {
                    // Executa o bot substituindo o processo atual do menu
                    require('./index.js');
                } catch (e) {
                    console.error('Erro ao iniciar:', e);
                }
                break;
            case '5':
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