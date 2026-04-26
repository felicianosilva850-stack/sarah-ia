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
moment.tz.setDefault("America/Sao_Paulo").locale("pt-br");
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
const MAX_CACHE = 500;
const store = {
	bind(ev) {
		ev.on("messages.upsert", ({ messages }) => {
			for (const msg of messages) {
				if (msg.key?.remoteJid && msg.key?.id) {
					msgCache.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
					if (msgCache.size > MAX_CACHE) {
						const first = msgCache.keys().next().value;
						msgCache.delete(first);
					}
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

async function connectToWhatsApp() {
	const { state, saveCreds } = await useMultiFileAuthState("session");
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
				const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
				console.log("connection closed, reconnecting ", shouldReconnect);
				if (shouldReconnect) {
					connectToWhatsApp();
				}
			} else if (connection === "open") {
				console.log(color("Bot conectado com sucesso!", "green"));
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
}
connectToWhatsApp();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});