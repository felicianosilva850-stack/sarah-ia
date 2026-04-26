const { BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, generateWAMessageContent, generateWAMessage, prepareWAMessageMedia, areJidsSameUser, getContentType } = require("@whiskeysockets/baileys");
const fs = require("fs"), util = require("util"), chalk = require("chalk"), Groq = require("groq-sdk");
let setting = require("./key.json");
const groq = new Groq({ apiKey: setting.keyopenai });

let chatHistory = {};
if (fs.existsSync('./memoria.json')) {
    chatHistory = JSON.parse(fs.readFileSync('./memoria.json', 'utf8'));
}

module.exports = sansekai = async (upsert, sock, store, message) => {
    try {
        let budy = (typeof message.text == 'string' ? message.text : '');
        var prefix = /^[\\/!#.]/gi.test(budy) ? budy.match(/^[\\/!#.]/gi) : "/";
        const isCmd = budy.startsWith(prefix),
              command = budy.replace(prefix,"").trim().split(/ +/).shift().toLowerCase(),
              args = budy.trim().split(/ +/).slice(1),
              pushname = message.pushName || "Usuário",
              from = message.chat;
        
        let text = (q = args.join(" "));
        const color = (t,c)=>{ return !c ? chalk.green(t) : chalk.keyword(c)(t); };

        const callAI = async(input)=>{
            if(!chatHistory[from]){
                chatHistory[from]=[
                    { role:'system', content:'meu nome é logan. o luan é meu dono. as mensagens chegam com a tag [De: Nome]. isso é só pra eu saber quem fala, nunca devo repetir ou imitar essa tag na minha resposta. nunca diga "seu dono", diga "meu dono". fale natural, tudo em minúscula, sem listas e sem ponto final. evite vírgulas desnecessárias e escreva como conversa de whatsapp' }
                ];
            }
            chatHistory[from].push({ role:'user', content:'[De: ' + pushname + '] ' + input });

            if(chatHistory[from].length>15){
                chatHistory[from].splice(1,2);
            }

            // limpa conversas antigas (mais de 50 chats salvos)
            const chats = Object.keys(chatHistory);
            if(chats.length > 50){
                const oldest = chats.slice(0, chats.length - 50);
                oldest.forEach(k => delete chatHistory[k]);
            }

            const res = await groq.chat.completions.create({
                messages:chatHistory[from],
                model:'llama-3.3-70b-versatile'
            });

            const resposta = res.choices[0].message.content;
            chatHistory[from].push({ role:'assistant', content:resposta });

            fs.writeFileSync('./memoria.json', JSON.stringify(chatHistory,null,2));
            return resposta;
        };

        if(isCmd){
            switch(command){
                case "help":
                case "menu":
                case "start":
                    message.reply(`*🤖 Bot AI (Groq)* *${prefix}ai* - Conversar *${prefix}sc* - Script`);
                    break;
                case "ai":
                case "openai":
                case "chatgpt":
                case "ask":
                    try{
                        if(!text) return message.reply("Diga algo!");
                        const resposta = await callAI(q);
                        await message.reply(resposta);
                    }catch(e){
                        message.reply("Erro Groq: "+e.message);
                    }
                    break;
                case "sc":
                    message.reply("GitHub: davyfll472-arch/Logan-ia");
                    break;
            }
        }else if(budy){
            const isGroup = from.endsWith('@g.us');
            const myNumber = sock.user.id.split(':')[0];
            const isMentioned = budy.includes('@'+myNumber);
            const startsWithLogan = budy.toLowerCase().startsWith('logan');
            
            let shouldReply=false;
            let textoLimpo=budy;

            if(isGroup){
                if(startsWithLogan || isMentioned){
                    shouldReply=true;
                    if(startsWithLogan){
                        textoLimpo = budy.replace(/^logan\s*/i,'').trim() || "oi";
                    }
                }
            }else{
                shouldReply=true;
                if(startsWithLogan){
                    textoLimpo = budy.replace(/^logan\s*/i,'').trim() || "oi";
                }
            }

            if(shouldReply){
                try{
                    const resposta = await callAI(textoLimpo);
                    await message.reply(resposta);
                }catch(e){
                    console.log(e);
                }
            }
        }
    }catch(err){
        console.log(err);
    }
};

let file=require.resolve(__filename);
fs.watchFile(file,()=>{
    fs.unwatchFile(file);
    delete require.cache[file];
    require(file);
});