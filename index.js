process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const {
	makeWASocket,
	fetchLatestBaileysVersion,
	DisconnectReason,
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
	proto,
	Browsers,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
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

const Logger = { level: "error" };
const logger = Pino({ ...Logger });

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

// Controle de reconexão para evitar loop infinito
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function connectToWhatsApp() {
	// Evitar múltiplas conexões simultâneas
	if (isConnecting) {
		console.log(chalk.yellow("Já existe uma conexão em andamento, ignorando..."));
		return;
	}
	isConnecting = true;

	try {
		const { state, saveCreds } = await useMultiFileAuthState("yusril");
		const { version } = await fetchLatestBaileysVersion();
		
		const sock = makeWASocket({
			auth: {
				creds: state.creds,
				keys: makeCacheableSignalKeyStore(state.keys, logger),
			},
			version: version,
			logger: logger,
			printQRInTerminal: false,
			markOnlineOnConnect: true,
			syncFullHistory: false,
			generateHighQualityLinkPreview: true,
			browser: Browsers.macOS('Chrome'),
			getMessage
		});

		if (!sock.authState.creds.registered) {
			setTimeout(async () => {
				const phoneNumber = await question('Digite o numero do WhatsApp com DDI (ex: 557199999999): ');
				const code = await sock.requestPairingCode(phoneNumber.trim());
				console.log(chalk.green(`CÓDIGO DE PAREAMENTO: ${code}`));
			}, 3000);
		}

		store?.bind(sock.ev);

		sock.ev.process(async (ev) => {
			if (ev["creds.update"]) {
				await saveCreds();
			}
			if (ev["connection.update"]) {
				const update = ev["connection.update"];
				const { connection, lastDisconnect } = update;

				if (connection === "close") {
					isConnecting = false;
					const statusCode = lastDisconnect?.error?.output?.statusCode;
					const payload = lastDisconnect?.error?.output?.payload;
					
					console.log(chalk.red(`Conexão fechada. Status: ${statusCode}`));
					
					// Se foi deslogado, não reconectar
					if (statusCode === DisconnectReason.loggedOut) {
						console.log(chalk.red("Bot foi deslogado. Delete a pasta 'yusril' e reinicie."));
						return;
					}
					
					// Se foi "replaced" (outra instância), não reconectar pra não criar loop
					if (statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
						console.log(chalk.red("Conexão substituída por outra instância. Encerrando..."));
						console.log(chalk.yellow("Certifique-se de que só UMA instância do bot está rodando."));
						return;
					}

					// Reconectar com limite de tentativas e delay
					reconnectAttempts++;
					if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
						console.log(chalk.red(`Máximo de ${MAX_RECONNECT_ATTEMPTS} tentativas atingido. Reinicie manualmente.`));
						return;
					}

					const delay = Math.min(reconnectAttempts * 3000, 15000);
					console.log(chalk.yellow(`Reconectando em ${delay/1000}s... (tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`));
					setTimeout(() => connectToWhatsApp(), delay);

				} else if (connection === "open") {
					isConnecting = false;
					reconnectAttempts = 0; // Reset no sucesso
					console.log(color("✅ Bot conectado com sucesso!", "green"));
				}
			}
			
			const upsert = ev["messages.upsert"];
			if (upsert) {
				if (upsert.type !== "notify") return;
				const message = Messages(upsert, sock);
				if (!message || message.sender === "status@broadcast") return;
				require("./sansekai.js")(upsert, sock, store, message);
			}
		});

		async function getMessage(key) {
			if (store) {
				const msg = await store.loadMessage(key.remoteJid, key.id);
				return msg?.message || undefined;
			}
			return proto.Message.fromObject({});
		}
		return sock;
	} catch (err) {
		isConnecting = false;
		console.log(chalk.red("Erro ao conectar:"), err);
		const delay = Math.min((reconnectAttempts + 1) * 3000, 15000);
		console.log(chalk.yellow(`Tentando novamente em ${delay/1000}s...`));
		setTimeout(() => connectToWhatsApp(), delay);
	}
}

connectToWhatsApp();