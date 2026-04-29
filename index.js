const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, ...args) {
    if (typeof warning === 'string' && warning.includes('NODE_TLS_REJECT_UNAUTHORIZED')) return;
    if (warning && warning.name === 'Warning' && warning.message && warning.message.includes('NODE_TLS_REJECT_UNAUTHORIZED')) return;
    return originalEmitWarning.call(process, warning, ...args);
};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Silenciar mensagens de erro internas do Baileys (decrypt/session)
const _origConsoleError = console.error;
const _origConsoleWarn = console.warn;
const silencedPatterns = [
    'Failed to decrypt',
    'MessageCounterError',
    'Key used already or never filled',
    'decryptWithSessions',
    'doDecryptWhisperMessage',
    'session_cipher',
    'queue_job',
];
function shouldSilence(args) {
    const text = args.map(a => (typeof a === 'string' ? a : (a?.stack || a?.message || String(a)))).join(' ');
    return silencedPatterns.some(p => text.includes(p));
}
console.error = function(...args) {
    if (shouldSilence(args)) return;
    _origConsoleError.apply(console, args);
};
console.warn = function(...args) {
    if (shouldSilence(args)) return;
    _origConsoleWarn.apply(console, args);
};
const {
	makeWASocket,
	fetchLatestBaileysVersion,
	DisconnectReason,
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
	proto,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");

if (!fs.existsSync('./key.json')) {
	fs.writeFileSync('./key.json', JSON.stringify({ keyopenai: "gsk_SUA_CHAVE_AQUI" }, null, 2));
}

const Pino = require("pino");
const chalk = require("chalk");
const moment = require("moment-timezone");
const readline = require("readline");
moment.tz.setDefault("America/Bahia").locale("pt-br");
const { Messages } = require("./lib/messages.js");

const question = (text) => {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(text, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
};

const logger = Pino({ level: "silent" });

const msgCache = new Map();
const store = {
	bind(ev) {
		ev.on("messages.upsert", ({ messages }) => {
			for (const msg of messages) {
				if (msg.key?.remoteJid && msg.key?.id) {
					msgCache.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
				}
			}
		});
	},
	async loadMessage(jid, id) {
		return msgCache.get(`${jid}:${id}`) || null;
	}
};

const color = (text, color) => {
  return !color ? chalk.green(text) : chalk.keyword(color)(text);
};

// Caminho ABSOLUTO da sessão (evita problema de diretório)
const SESSION_DIR = path.join(__dirname, "yusril");

// IDs de mensagens enviadas pelo bot
const sentMessageIds = new Set();

async function startBot() {
	const hasSession = fs.existsSync(SESSION_DIR) && fs.readdirSync(SESSION_DIR).length > 0;

	const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
	const { version } = await fetchLatestBaileysVersion();

	const sock = makeWASocket({
		version,
		logger,
		printQRInTerminal: false,
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		generateHighQualityLinkPreview: true,
		getMessage: async (key) => {
			const msg = await store.loadMessage(key.remoteJid, key.id);
			return msg?.message || undefined;
		}
	});

	// Interceptar sendMessage para rastrear IDs
	const _origSend = sock.sendMessage.bind(sock);
	sock.sendMessage = async (jid, message, options) => {
		const res = await _origSend(jid, message, options);
		if (res?.key?.id) {
			sentMessageIds.add(res.key.id);
			setTimeout(() => sentMessageIds.delete(res.key.id), 60000);
		}
		return res;
	};

	// Se não tiver credenciais registradas, pedir código de pareamento
	if (!sock.authState.creds.registered) {
		setTimeout(async () => {
			const phoneNumber = await question('Digite o numero do WhatsApp com DDI (ex: 557199999999): ');
			const code = await sock.requestPairingCode(phoneNumber.trim());
			console.log(chalk.green(`CÓDIGO DE PAREAMENTO: ${code}`));
		}, 3000);
	}

	store?.bind(sock.ev);

	sock.ev.on('creds.update', saveCreds);

	// Atualização de conexão
	sock.ev.on('connection.update', async (update) => {
		const { connection, lastDisconnect } = update;

		if (connection === 'close') {
			const lastStatus = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.status;
			const isLoggedOut = lastStatus === DisconnectReason.loggedOut;
			const shouldReconnect = !isLoggedOut;

			if (shouldReconnect) {
				const delay = lastStatus === 515 ? 1000 : 3000;
				setTimeout(() => startBot(), delay);
			} else {
				setTimeout(() => {
					try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
					startBot();
				}, 3000);
			}
		}

		if (connection === 'open') {
			console.log(color("✅ Bot conectado com sucesso!", "green"));
		}
	});

	// Novas mensagens
	sock.ev.on('messages.upsert', ({ messages, type }) => {
		if (type !== 'notify') return;

		for (const msg of messages) {
			if (msg.key.remoteJid === 'status@broadcast') continue;

			if (msg.key.fromMe) {
				if (msg.key.id && sentMessageIds.has(msg.key.id)) continue;
			}

			const message = Messages({ messages: [msg], type }, sock);
			if (!message) continue;
			require("./sansekai.js")({ messages: [msg], type }, sock, store, message);
		}
	});
}

process.on('uncaughtException', (error) => {
	console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (error) => {
	console.error('❌ Promise rejeitada:', error);
});

process.on('SIGINT', () => {
	process.exit(0);
});

const banner = `
╔══════════════════════╗
║     LOGAN  -  IA     ║
╚══════════════════════╝
  🚀 Inicializando...
`;

console.clear();
console.log(chalk.cyan(banner));

startBot().catch(error => {
	console.error('❌ Erro ao iniciar bot:', error);
	process.exit(1);
});
