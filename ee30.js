const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');
const dns = require('dns').promises;
const crypto = require('crypto');
const net = require('net');

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const TOKEN = 'YOUR_DISCORD_BOT_KEY';
const MY_ID = '12345678';
const GROQ_KEY = 'gsk_UR_GROQ_KEY'; // free at console.groq.com/keys

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'EE30/6.0' } }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject('parse'); } });
        }).on('error', reject);
    });
}

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'EE30/6.0' } }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        }).on('error', reject);
    });
}

async function safe(channel, content) {
    if (content.length <= 2000) return channel.send(content);
    return channel.send(content.slice(0, 1997) + '```');
}

async function chunked(channel, header, content) {
    const lines = content.split('\n');
    let chunk = '', first = true;
    for (const line of lines) {
        if (('```fix\n' + (first ? header : '(cont.)') + '\n' + chunk + line + '\n```').length > 1950) {
            await channel.send('```fix\n' + (first ? header : '(cont.)') + '\n' + chunk + '```');
            chunk = ''; first = false;
        }
        chunk += line + '\n';
    }
    if (chunk.trim()) await channel.send('```fix\n' + (first ? header : '(cont.)') + '\n' + chunk + '```');
}

function glitch(t) {
    const g = '!@#$%^&*<>?/|[]{}~`';
    return t.split('').map(c => Math.random() < 0.3 ? g[Math.floor(Math.random() * g.length)] : c).join('');
}

const BLOCK = {
    'A':['▄▀█','█▀█'],'B':['█▄▄','█▄█'],'C':['█▀▀','█▄▄'],'D':['█▀▄','█▄▀'],'E':['█▀▀','█▄▄'],
    'F':['█▀▀','█▀▀'],'G':['█▀▀','█▄█'],'H':['█ █','█▀█'],'I':['█','█'],'J':['  █','█▄█'],
    'K':['█▀▄','█▄▀'],'L':['█  ','█▄▄'],'M':['█▄█','█ █'],'N':['█▄█','█ █'],'O':['█▀█','█▄█'],
    'P':['█▀▄','█▀▀'],'Q':['█▀█','█▄▀'],'R':['█▀▄','█▄▀'],'S':['▄▀▀','▄▄▀'],'T':['▀█▀',' █ '],
    'U':['█ █','█▄█'],'V':['█ █','▀▄▀'],'W':['█ █','█▄█'],'X':['▀▄▀','█ █'],'Y':['▀▄▀',' █ '],
    'Z':['▀▀█','█▄▄'],'0':['█▀█','█▄█'],'1':[' █',' █'],'2':['▀▀█','█▄▄'],'3':['▀▀█','▄▄█'],
    '4':['█▄█','  █'],'5':['█▀▀','▄▄█'],'6':['█▀▀','█▄█'],'7':['▀▀█','  █'],'8':['█▀█','█▄█'],
    '9':['█▀█','▀▀█'],' ':['  ','  ']
};

// ─────────────────────────────────────────
// GROQ AI HELPER
// ─────────────────────────────────────────
async function groq(system, userMsg, maxTokens = 300) {
    const payload = JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: maxTokens,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg },
        ],
    });
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Length': Buffer.byteLength(payload),
            },
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject('parse error'); } });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ─────────────────────────────────────────
// READY
// ─────────────────────────────────────────
client.once('clientReady', () => {
    console.log('\x1b[32m[EE30]: V6.0 ONLINE\x1b[0m');
    console.log(`\x1b[36m[BOT]: ${client.user.tag}\x1b[0m`);
    client.user.setActivity('EE30 TERMINAL V6.0', { type: 3 });
});

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || msg.author.id !== MY_ID) return;
    const raw = msg.content.trim();
    const args = raw.split(/\s+/);
    const cmd = args[0].toLowerCase();

    // ══════════════════════════════════════
    // MENU (3 pages)
    // ══════════════════════════════════════
    if (cmd === '!menu') {
        if (msg.guild) await msg.delete().catch(() => {});
        await safe(msg.channel, '```fix\n' +
            '╔══════════════════════════════════╗\n' +
            '║    EE30 TERMINAL V6.0  [1/3]     ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  CHANNEL                         ║\n' +
            '║  [.1]  SPAM FLOOD                ║\n' +
            '║  [.2]  SCREEN CRASH              ║\n' +
            '║  [.3]  PURGE 50                  ║\n' +
            '║  [.4]  GHOST PROTOCOL            ║\n' +
            '║  [.5]  LOCKDOWN  [.5u] UNLOCK    ║\n' +
            '║  [.6]  DECRYPT SEQ               ║\n' +
            '║  [.7]  LATENCY                   ║\n' +
            '║  [.8]  KILL BOT                  ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  SERVER                          ║\n' +
            '║  [.9]  SERVER INFO               ║\n' +
            '║  [.10] MEMBER COUNT              ║\n' +
            '║  [.11] BOT LIST                  ║\n' +
            '║  [.12] ROLE LIST                 ║\n' +
            '║  [.13] CHANNEL LIST              ║\n' +
            '║  [.14] FAKE LOADING              ║\n' +
            '║  [.15] COUNTDOWN                 ║\n' +
            '║  [.16] REPEAT MSG                ║\n' +
            '║  [.17] SLOWMODE  [.17u] OFF      ║\n' +
            '║  [.18] EMBED BUILDER             ║\n' +
            '║  [.19] BOT STATUS                ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  DISCORD API                     ║\n' +
            '║  [.20] TOKEN INFO                ║\n' +
            '║  [.21] WEBHOOK TEST              ║\n' +
            '║  [.22] INVITE CHECK              ║\n' +
            '║  [.23] SERVER LOOKUP             ║\n' +
            '║  [.24] BOT INVITE LINK           ║\n' +
            '║  [.25] USER LOOKUP               ║\n' +
            '║  [.26] CHANNEL INFO              ║\n' +
            '║  [.27] ROLE INFO                 ║\n' +
            '║  [.28] EMOJI LIST                ║\n' +
            '║  [.29] SERVER ICON               ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  NETWORK                         ║\n' +
            '║  [.30] IP LOOKUP                 ║\n' +
            '║  [.31] DNS LOOKUP                ║\n' +
            '║  [.32] REVERSE DNS               ║\n' +
            '║  [.33] PORT CHECK                ║\n' +
            '║  [.34] HTTP HEADERS              ║\n' +
            '║  [.35] PING HOST                 ║\n' +
            '║  [.36] TRACEROUTE                ║\n' +
            '║  [.37] WHOIS                     ║\n' +
            '║  [.38] SSL CERT CHECK            ║\n' +
            '║  [.39] MAC LOOKUP                ║\n' +
            '╚══════════════════════════════════╝\n' +
            '```');
        await safe(msg.channel, '```fix\n' +
            '╔══════════════════════════════════╗\n' +
            '║    EE30 TERMINAL V6.0  [2/3]     ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  SYSTEM                          ║\n' +
            '║  [.40] SYSTEM INFO               ║\n' +
            '║  [.41] CPU INFO                  ║\n' +
            '║  [.42] RAM INFO                  ║\n' +
            '║  [.43] DISK INFO                 ║\n' +
            '║  [.44] NET INTERFACES            ║\n' +
            '║  [.45] UPTIME                    ║\n' +
            '║  [.46] PROCESS LIST              ║\n' +
            '║  [.47] ENV VARIABLES             ║\n' +
            '║  [.48] OPEN PORTS                ║\n' +
            '║  [.49] DIR LISTING               ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  SECURITY                        ║\n' +
            '║  [.50] PASSWORD GEN              ║\n' +
            '║  [.51] HASH TEXT                 ║\n' +
            '║  [.52] BASE64 ENCODE             ║\n' +
            '║  [.53] BASE64 DECODE             ║\n' +
            '║  [.54] IP REPUTATION             ║\n' +
            '║  [.55] UUID GENERATOR            ║\n' +
            '║  [.56] HEX ENCODE                ║\n' +
            '║  [.57] HEX DECODE                ║\n' +
            '║  [.58] ROT13                     ║\n' +
            '║  [.59] BINARY ENCODE             ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  TOOLS                           ║\n' +
            '║  [.80] WEATHER                   ║\n' +
            '║  [.81] CALCULATOR                ║\n' +
            '║  [.82] URBAN DICTIONARY          ║\n' +
            '║  [.83] STEAM PROFILE             ║\n' +
            '║  [.84] CRYPTO PRICE              ║\n' +
            '║  [.85] COUNTRY INFO              ║\n' +
            '║  [.86] CAT FACT                  ║\n' +
            '║  [.87] DOG FACT                  ║\n' +
            '║  [.88] QR CODE LINK              ║\n' +
            '║  [.89] TIMEZONE                  ║\n' +
            '║  [.90] WORD DEFINITION           ║\n' +
            '║  [.91] GITHUB USER               ║\n' +
            '║  [.92] GITHUB REPO               ║\n' +
            '║  [.93] IP GEO MAP                ║\n' +
            '║  [.94] COLOR INFO                ║\n' +
            '║  [.95] UUID INFO                 ║\n' +
            '║  [.96] MOCK TEXT                 ║\n' +
            '║  [.97] LEET SPEAK                ║\n' +
            '║  [.98] REVERSE TEXT              ║\n' +
            '║  [.99] WORD COUNT                ║\n' +
            '╚══════════════════════════════════╝\n' +
            '```');
        return safe(msg.channel, '```fix\n' +
            '╔══════════════════════════════════╗\n' +
            '║    EE30 TERMINAL V6.0  [3/3]     ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  FUN & GAMES                     ║\n' +
            '║  [.60] MATRIX RAIN               ║\n' +
            '║  [.61] GLITCH TEXT               ║\n' +
            '║  [.62] TYPEWRITER                ║\n' +
            '║  [.63] FAKE HACK                 ║\n' +
            '║  [.64] NUKE SEQUENCE             ║\n' +
            '║  [.65] COIN FLIP                 ║\n' +
            '║  [.66] DICE ROLL                 ║\n' +
            '║  [.67] RANDOM FACT               ║\n' +
            '║  [.68] JOKE                      ║\n' +
            '║  [.69] 8BALL                     ║\n' +
            '║  [.70] ASCII LOGO                ║\n' +
            '║  [.71] ASCII BANNER              ║\n' +
            '║  [.72] SELF DESTRUCT             ║\n' +
            '║  [.73] BOOT SEQUENCE             ║\n' +
            '║  [.74] ROULETTE                  ║\n' +
            '║  [.101] WOULD YOU RATHER         ║\n' +
            '║  [.102] TRIVIA                   ║\n' +
            '║  [.103] NUMBER GUESS             ║\n' +
            '║  [.104] MORSE CODE               ║\n' +
            '║  [.105] MORSE DECODE             ║\n' +
            '║  [.106] ZALGO TEXT               ║\n' +
            '║  [.107] CLAP TEXT                ║\n' +
            '║  [.108] TINY TEXT                ║\n' +
            '║  [.109] VAPORWAVE TEXT           ║\n' +
            '║  [.110] COMPLIMENT               ║\n' +
            '║  [.111] INSULT GEN               ║\n' +
            '║  [.112] SHIP NAMES               ║\n' +
            '║  [.113] RATE THING               ║\n' +
            '║  [.114] NEVER HAVE I EVER        ║\n' +
            '║  [.115] TRUTH OR DARE            ║\n' +
            '║  [.116] ROCK PAPER SCISSORS      ║\n' +
            '║  [.117] RANDOM COLOR             ║\n' +
            '║  [.118] FAKE TWEET               ║\n' +
            '║  [.119] PROGRESS BAR             ║\n' +
            '║  [.120] HYPE TRAIN               ║\n' +
            '╠══════════════════════════════════╣\n' +
            '║  AI  (free — Groq/Llama)         ║\n' +
            '║  [.200] AI ROAST                 ║\n' +
            '║  [.201] AI CHAT                  ║\n' +
            '║  [.202] AI TRIVIA                ║\n' +
            '╚══════════════════════════════════╝\n' +
            '```');
    }

    // .1 SPAM FLOOD
    if (cmd === '.1') {
        await msg.delete().catch(() => {});
        for (let i = 0; i < 10; i++) { await msg.channel.send('`[EE30]: ██████████ SIGNAL FLOOD ██████████`'); await sleep(400); }
        return;
    }
    // .2 SCREEN CRASH
    if (cmd === '.2') {
        await msg.delete().catch(() => {});
        for (const f of ['`▓▒░ MEMORY FAULT 0x00F3A1 ░▒▓`','`##### KERNEL PANIC #####`','`STACK OVERFLOW ()*&^%$#@!`','`SEGFAULT: CORE DUMPED`','`BSOD: PAGE_FAULT_IN_NONPAGED_AREA`','`FATAL: 0xDEADBEEF`']) { await msg.channel.send(f); await sleep(500); }
        await msg.channel.send('`[RECOVERY]: SYSTEM RESTORED.`');
        return;
    }
    // .3 PURGE
    if (cmd === '.3') {
        await msg.delete().catch(() => {});
        const d = await msg.channel.bulkDelete(50, true).catch(() => null);
        const n = await msg.channel.send(`\`[PURGE]: ${d?.size ?? 0} DELETED.\``);
        setTimeout(() => n.delete().catch(() => {}), 3000);
        return;
    }
    // .4 GHOST
    if (cmd === '.4') {
        await msg.delete().catch(() => {});
        const n = await msg.channel.send('`[GHOST]: DARK.`');
        setTimeout(() => n.delete().catch(() => {}), 2000);
        return;
    }
    // .5 LOCKDOWN
    if (cmd === '.5') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: false });
        await msg.channel.send('`[LOCK]: SEALED.`');
        return;
    }
    // .5u UNLOCK
    if (cmd === '.5u') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await msg.channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true });
        await msg.channel.send('`[UNLOCK]: OPEN.`');
        return;
    }
    // .6 DECRYPT
    if (cmd === '.6') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[DECRYPT]: [          ] 0%`');
        for (let i = 0; i < 5; i++) { await sleep(700); await m.edit(`\`[DECRYPT]: [${'█'.repeat((i+1)*2).padEnd(10)}] ${(i+1)*20}%\``); }
        await m.edit('`[DECRYPT]: COMPLETE.`');
        return;
    }
    // .7 LATENCY
    if (cmd === '.7') {
        await msg.delete().catch(() => {});
        const s = await msg.channel.send('`[PING]...`');
        await s.edit(`\`[LAT]: API ${s.createdTimestamp - msg.createdTimestamp}ms | WS ${client.ws.ping}ms\``);
        return;
    }
    // .8 KILL
    if (cmd === '.8') {
        await msg.channel.send('`[EE30]: OFFLINE.`');
        await sleep(800);
        process.exit();
    }
    // .9 SERVER INFO
    if (cmd === '.9') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        const g = msg.guild;
        await safe(msg.channel, '```fix\n[SERVER]\n' + `[NAME]:    ${g.name}\n[ID]:      ${g.id}\n[OWNER]:   ${g.ownerId}\n[MEMBERS]: ${g.memberCount}\n[CREATED]: ${g.createdAt.toDateString()}\n[BOOST]:   Lvl${g.premiumTier}(${g.premiumSubscriptionCount})\n` + '```');
        return;
    }
    // .10 MEMBER COUNT
    if (cmd === '.10') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await msg.guild.members.fetch();
        const bots = msg.guild.members.cache.filter(m => m.user.bot).size;
        await safe(msg.channel, '```fix\n[MEMBERS]\n' + `[TOTAL]:  ${msg.guild.memberCount}\n[HUMANS]: ${msg.guild.memberCount - bots}\n[BOTS]:   ${bots}\n` + '```');
        return;
    }
    // .11 BOT LIST
    if (cmd === '.11') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await msg.guild.members.fetch();
        await chunked(msg.channel, '[BOT LIST]', msg.guild.members.cache.filter(m => m.user.bot).map(m => m.user.tag).join('\n') || 'NONE');
        return;
    }
    // .12 ROLE LIST
    if (cmd === '.12') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await chunked(msg.channel, '[ROLES]', msg.guild.roles.cache.filter(r => r.name !== '@everyone').sort((a,b) => b.position - a.position).map(r => `[${r.position}] ${r.name} (${r.members.size})`).join('\n') || 'NONE');
        return;
    }
    // .13 CHANNEL LIST
    if (cmd === '.13') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await chunked(msg.channel, '[CHANNELS]', msg.guild.channels.cache.filter(c => c.type === 0).map(c => `#${c.name}`).join('\n') || 'NONE');
        return;
    }
    // .14 FAKE LOADING
    if (cmd === '.14') {
        await msg.delete().catch(() => {});
        const steps = ['BOOTING...','MODULES...','TUNNEL...','BYPASS FW1...','BYPASS FW2...','INJECT...','CLEAN...','DONE.'];
        const m = await msg.channel.send(`\`[INIT]: ${steps[0]}\``);
        for (let i = 1; i < steps.length; i++) { await sleep(800); await m.edit(`\`[INIT]: ${steps[i]}\``); }
        return;
    }
    // .15 COUNTDOWN
    if (cmd === '.15') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[T]: 10`');
        for (let i = 9; i >= 0; i--) { await sleep(1000); await m.edit(i === 0 ? '`💥 DETONATED`' : `\`[T]: ${i}\``); }
        return;
    }
    // .16 REPEAT
    if (cmd === '.16') {
        await msg.delete().catch(() => {});
        const t = Math.min(parseInt(args[1]) || 3, 10);
        const txt = args.slice(2).join(' ') || 'EE30';
        for (let i = 0; i < t; i++) { await msg.channel.send(`\`[BC]: ${txt}\``); await sleep(400); }
        return;
    }
    // .17 SLOWMODE
    if (cmd === '.17') {
        await msg.delete().catch(() => {});
        await msg.channel.setRateLimitPerUser(5);
        await msg.channel.send('`[SLOW]: ON (5s)`');
        return;
    }
    if (cmd === '.17u') {
        await msg.delete().catch(() => {});
        await msg.channel.setRateLimitPerUser(0);
        await msg.channel.send('`[SLOW]: OFF`');
        return;
    }
    // .18 EMBED
    if (cmd === '.18') {
        await msg.delete().catch(() => {});
        const parts = raw.slice(4).trim().split('|');
        await msg.channel.send({ embeds: [new EmbedBuilder().setColor(0x00ff99).setTitle(`⚡ ${parts[0]?.trim()||'EE30'}`).setDescription('```fix\n'+(parts[1]?.trim()||'...')+'\n```').setFooter({text:'EE30 V6.0'}).setTimestamp()] });
        return;
    }
    // .19 STATUS
    if (cmd === '.19') {
        await msg.delete().catch(() => {});
        const u = process.uptime(), m2 = process.memoryUsage();
        await safe(msg.channel, '```fix\n[STATUS]\n' + `[UP]:   ${Math.floor(u/3600)}h${Math.floor((u%3600)/60)}m${Math.floor(u%60)}s\n[PING]: ${client.ws.ping}ms\n[HEAP]: ${(m2.heapUsed/1048576).toFixed(1)}MB\n[NODE]: ${process.version}\n` + '```');
        return;
    }
    // .20 TOKEN INFO
    if (cmd === '.20') {
        await msg.delete().catch(() => {});
        await safe(msg.channel, '```fix\n[TOKEN]\n' + `[TAG]:    ${client.user.tag}\n[ID]:     ${client.user.id}\n[GUILDS]: ${client.guilds.cache.size}\n` + '```');
        return;
    }
    // .21 WEBHOOK TEST
    if (cmd === '.21') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .21 <url>`');
        const m = await msg.channel.send('`[WH]...`');
        try {
            const p = JSON.stringify({ content: '`[EE30]: WEBHOOK OK`' });
            const u2 = new URL(args[1]);
            const s = await new Promise((res,rej) => { const r = https.request({hostname:u2.hostname,path:u2.pathname+u2.search,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(p)}},res2=>res(res2.statusCode)); r.on('error',rej); r.write(p); r.end(); });
            await m.edit(`\`[WH]: ${s}\``);
        } catch { await m.edit('`[WH]: FAILED`'); }
        return;
    }
    // .22 INVITE CHECK
    if (cmd === '.22') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .22 <code>`');
        const m = await msg.channel.send('`[INV]...`');
        try {
            const d = await fetchJSON(`https://discord.com/api/v10/invites/${args[1]}`);
            await m.edit('```fix\n[INVITE]\n' + `[CODE]:    ${d.code}\n[SERVER]:  ${d.guild?.name??'N/A'}\n[CHANNEL]: #${d.channel?.name??'N/A'}\n[MEMBERS]: ${d.approximate_member_count??'N/A'}\n` + '```');
        } catch { await m.edit('`[INV]: INVALID`'); }
        return;
    }
    // .23 SERVER LOOKUP
    if (cmd === '.23') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .23 <id>`');
        const m = await msg.channel.send('`[SRV]...`');
        try {
            const d = await fetchJSON(`https://discord.com/api/v10/guilds/${args[1]}/widget.json`);
            await m.edit('```fix\n[SERVER]\n' + `[NAME]:   ${d.name}\n[ID]:     ${d.id}\n[ONLINE]: ${d.presence_count??'N/A'}\n` + '```');
        } catch { await m.edit('`[SRV]: NOT FOUND`'); }
        return;
    }
    // .24 BOT INVITE
    if (cmd === '.24') {
        await msg.delete().catch(() => {});
        const id = args[1] || client.user.id;
        await safe(msg.channel, '```fix\n[INVITE]\n' + `[ID]:  ${id}\n[URL]: https://discord.com/oauth2/authorize?client_id=${id}&permissions=8&scope=bot\n` + '```');
        return;
    }
    // .25 USER LOOKUP
    if (cmd === '.25') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .25 <id>`');
        const m = await msg.channel.send('`[USR]...`');
        try {
            const u2 = await client.users.fetch(args[1]);
            await m.edit('```fix\n[USER]\n' + `[TAG]:     ${u2.tag}\n[ID]:      ${u2.id}\n[BOT]:     ${u2.bot}\n[CREATED]: ${u2.createdAt.toDateString()}\n` + '```');
        } catch { await m.edit('`[USR]: NOT FOUND`'); }
        return;
    }
    // .26 CHANNEL INFO
    if (cmd === '.26') {
        await msg.delete().catch(() => {});
        const ch = msg.channel;
        await safe(msg.channel, '```fix\n[CHANNEL]\n' + `[NAME]:    #${ch.name}\n[ID]:      ${ch.id}\n[TYPE]:    ${ch.type}\n[CREATED]: ${ch.createdAt.toDateString()}\n[TOPIC]:   ${ch.topic||'NONE'}\n` + '```');
        return;
    }
    // .27 ROLE INFO
    if (cmd === '.27') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        const role = msg.guild.roles.cache.get(args[1]);
        if (!role) return msg.channel.send('`[ERR]: .27 <role_id>`');
        await safe(msg.channel, '```fix\n[ROLE]\n' + `[NAME]:    ${role.name}\n[ID]:      ${role.id}\n[COLOR]:   ${role.hexColor}\n[MEMBERS]: ${role.members.size}\n[POS]:     ${role.position}\n` + '```');
        return;
    }
    // .28 EMOJI LIST
    if (cmd === '.28') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        await chunked(msg.channel, '[EMOJIS]', msg.guild.emojis.cache.map(e => `${e.name} (${e.id})`).join('\n') || 'NONE');
        return;
    }
    // .29 SERVER ICON
    if (cmd === '.29') {
        if (!msg.guild) return;
        await msg.delete().catch(() => {});
        const url = msg.guild.iconURL({ size: 1024 });
        if (!url) return msg.channel.send('`[ERR]: NO ICON`');
        await msg.channel.send('```fix\n[ICON]\n' + `[SERVER]: ${msg.guild.name}\n[URL]:    ${url}\n` + '```');
        return;
    }
    // .30 IP LOOKUP
    if (cmd === '.30') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[IP]...`');
        try {
            const d = await fetchJSON(`http://ip-api.com/json/${args[1]||''}`);
            await m.edit('```fix\n[IP]\n' + `[IP]:      ${d.query}\n[ISP]:     ${d.isp}\n[CITY]:    ${d.city}\n[COUNTRY]: ${d.country}\n[TZ]:      ${d.timezone}\n` + '```');
        } catch { await m.edit('`[IP]: FAILED`'); }
        return;
    }
    // .31 DNS
    if (cmd === '.31') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .31 <domain>`');
        const m = await msg.channel.send('`[DNS]...`');
        try {
            const [a,mx,ns] = await Promise.allSettled([dns.resolve4(args[1]),dns.resolveMx(args[1]),dns.resolveNs(args[1])]);
            await m.edit('```fix\n[DNS]\n' + `[A]:  ${a.status==='fulfilled'?a.value.join(', '):'N/A'}\n[MX]: ${mx.status==='fulfilled'?mx.value.map(r=>r.exchange).join(', '):'N/A'}\n[NS]: ${ns.status==='fulfilled'?ns.value.join(', '):'N/A'}\n` + '```');
        } catch { await m.edit('`[DNS]: FAILED`'); }
        return;
    }
    // .32 REVERSE DNS
    if (cmd === '.32') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .32 <ip>`');
        const m = await msg.channel.send('`[RDNS]...`');
        try {
            const h = await dns.reverse(args[1]);
            await m.edit('```fix\n[RDNS]\n' + `[IP]:   ${args[1]}\n[HOST]: ${h.join(', ')}\n` + '```');
        } catch { await m.edit('`[RDNS]: NO RECORD`'); }
        return;
    }
    // .33 PORT CHECK
    if (cmd === '.33') {
        await msg.delete().catch(() => {});
        const [host, port] = [args[1], parseInt(args[2])];
        if (!host||!port) return msg.channel.send('`[ERR]: .33 <host> <port>`');
        const m = await msg.channel.send(`\`[PORT]: ${host}:${port}...\``);
        const res2 = await new Promise(resolve => {
            const s = new net.Socket();
            s.setTimeout(3000);
            s.on('connect',()=>{s.destroy();resolve('OPEN');});
            s.on('error',()=>{s.destroy();resolve('CLOSED');});
            s.on('timeout',()=>{s.destroy();resolve('TIMEOUT');});
            s.connect(port,host);
        });
        await m.edit('```fix\n[PORT]\n' + `[HOST]:   ${host}\n[PORT]:   ${port}\n[STATUS]: ${res2}\n` + '```');
        return;
    }
    // .34 HTTP HEADERS
    if (cmd === '.34') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .34 <url>`');
        const m = await msg.channel.send('`[HDR]...`');
        try {
            const hdrs = await new Promise((res2,rej) => { const mod=args[1].startsWith('https')?https:http; mod.get(args[1],{headers:{'User-Agent':'EE30'}},r=>{res2(r.headers);r.destroy();}).on('error',rej); });
            await m.edit('```fix\n[HEADERS]\n' + Object.entries(hdrs).slice(0,10).map(([k,v])=>`[${k.toUpperCase()}]: ${String(v).slice(0,70)}`).join('\n') + '\n```');
        } catch { await m.edit('`[HDR]: FAILED`'); }
        return;
    }
    // .35 PING HOST
    if (cmd === '.35') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .35 <host>`');
        const m = await msg.channel.send(`\`[PING]: ${args[1]}...\``);
        try { const t=Date.now(); await fetchText(`http://${args[1]}`); await m.edit(`\`[PING]: ${args[1]} — ${Date.now()-t}ms\``); }
        catch { await m.edit(`\`[PING]: ${args[1]} — UNREACHABLE\``); }
        return;
    }
    // .36 TRACEROUTE
    if (cmd === '.36') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .36 <host>`');
        const m = await msg.channel.send('`[TRACE]...`');
        try {
            const isW = process.platform==='win32';
            const out = execSync(`${isW?'tracert -h 10':'traceroute -m 10'} ${args[1]} 2>&1`,{timeout:15000}).toString();
            await m.edit('```\n'+out.split('\n').slice(0,15).join('\n').slice(0,1800)+'\n```');
        } catch { await m.edit('`[TRACE]: FAILED`'); }
        return;
    }
    // .37 WHOIS
    if (cmd === '.37') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .37 <domain>`');
        const m = await msg.channel.send('`[WHOIS]...`');
        try {
            const d = await fetchJSON(`https://api.whoisjsonapi.com/v1/${args[1]}`);
            const w = d.domain;
            await m.edit('```fix\n[WHOIS]\n' + `[DOMAIN]:    ${w?.name??args[1]}\n[REGISTRAR]: ${w?.registrar?.name??'N/A'}\n[CREATED]:   ${w?.created_date??'N/A'}\n[EXPIRES]:   ${w?.expiration_date??'N/A'}\n` + '```');
        } catch { await m.edit('`[WHOIS]: FAILED`'); }
        return;
    }
    // .38 SSL CERT CHECK
    if (cmd === '.38') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .38 <hostname>`');
        const m = await msg.channel.send('`[SSL]...`');
        try {
            const cert = await new Promise((res2,rej) => {
                const req = https.request({host:args[1],port:443,method:'HEAD',rejectUnauthorized:false},r=>{res2(r.socket.getPeerCertificate());});
                req.on('error',rej); req.end();
            });
            await m.edit('```fix\n[SSL]\n' + `[HOST]:    ${args[1]}\n[ISSUED]:  ${cert.subject?.CN??'N/A'}\n[ISSUER]:  ${cert.issuer?.O??'N/A'}\n[EXPIRES]: ${cert.valid_to??'N/A'}\n` + '```');
        } catch { await m.edit('`[SSL]: FAILED`'); }
        return;
    }
    // .39 MAC LOOKUP
    if (cmd === '.39') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .39 <mac>`');
        const m = await msg.channel.send('`[MAC]...`');
        try {
            const d = await fetchJSON(`https://api.macvendors.com/${encodeURIComponent(args[1])}`);
            await m.edit('```fix\n[MAC]\n' + `[MAC]:    ${args[1]}\n[VENDOR]: ${typeof d==='string'?d:JSON.stringify(d)}\n` + '```');
        } catch { await m.edit('`[MAC]: NOT FOUND`'); }
        return;
    }
    // .40 SYSTEM INFO
    if (cmd === '.40') {
        await msg.delete().catch(() => {});
        await safe(msg.channel, '```fix\n[SYS]\n' + `[OS]:   ${os.type()} ${os.release()}\n[ARCH]: ${os.arch()}\n[HOST]: ${os.hostname()}\n[USER]: ${os.userInfo().username}\n[NODE]: ${process.version}\n` + '```');
        return;
    }
    // .41 CPU
    if (cmd === '.41') {
        await msg.delete().catch(() => {});
        const c = os.cpus();
        await safe(msg.channel, '```fix\n[CPU]\n' + `[MODEL]: ${c[0].model}\n[CORES]: ${c.length}\n[SPEED]: ${c[0].speed}MHz\n[LOAD]:  ${os.loadavg().map(l=>l.toFixed(2)).join(' / ')}\n` + '```');
        return;
    }
    // .42 RAM
    if (cmd === '.42') {
        await msg.delete().catch(() => {});
        const tot=(os.totalmem()/1073741824).toFixed(2), fr=(os.freemem()/1073741824).toFixed(2), us=(tot-fr).toFixed(2);
        await safe(msg.channel, '```fix\n[RAM]\n' + `[TOTAL]: ${tot}GB\n[USED]:  ${us}GB (${((us/tot)*100).toFixed(1)}%)\n[FREE]:  ${fr}GB\n` + '```');
        return;
    }
    // .43 DISK
    if (cmd === '.43') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[DISK]...`');
        try {
            const isW=process.platform==='win32';
            await m.edit('```fix\n[DISK]\n'+execSync(isW?'wmic logicaldisk get size,freespace,caption':'df -h',{timeout:5000}).toString().trim().split('\n').slice(0,8).join('\n').slice(0,1800)+'\n```');
        } catch { await m.edit('`[DISK]: UNAVAILABLE`'); }
        return;
    }
    // .44 NET INTERFACES
    if (cmd === '.44') {
        await msg.delete().catch(() => {});
        let out='';
        for (const [n,a] of Object.entries(os.networkInterfaces())) { for (const i of a) { if (!i.internal) out+=`[${n}]: ${i.address} (${i.family})\n`; } }
        await chunked(msg.channel, '[NET]', out||'NONE');
        return;
    }
    // .45 UPTIME
    if (cmd === '.45') {
        await msg.delete().catch(() => {});
        const fmt=s=>`${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m${Math.floor(s%60)}s`;
        await safe(msg.channel, '```fix\n[UPTIME]\n' + `[SYS]: ${fmt(os.uptime())}\n[BOT]: ${fmt(process.uptime())}\n` + '```');
        return;
    }
    // .46 PROCESS LIST
    if (cmd === '.46') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[PROC]...`');
        try {
            const isW=process.platform==='win32';
            const out=execSync(isW?'tasklist /fo csv /nh':'ps aux --sort=-%cpu | head -16',{timeout:5000}).toString();
            const lines=isW?out.trim().split('\n').slice(0,15).map(l=>{const p=l.replace(/"/g,'').split(',');return`${(p[0]||'').slice(0,28).padEnd(29)}PID:${(p[1]||'').trim()}`;}).join('\n'):out.trim().split('\n').slice(1,16).map(l=>{const p=l.trim().split(/\s+/);return`${(p[10]||'').slice(0,24).padEnd(25)}CPU:${p[2]}%`;}).join('\n');
            await m.edit('```fix\n[PROCS]\n'+lines.slice(0,1800)+'\n```');
        } catch { await m.edit('`[PROC]: UNAVAILABLE`'); }
        return;
    }
    // .47 ENV VARIABLES
    if (cmd === '.47') {
        await msg.delete().catch(() => {});
        const safe_keys = ['PATH','HOME','USERNAME','USERPROFILE','OS','COMPUTERNAME','NODE_ENV','TERM','SHELL','LANG'];
        const out = safe_keys.map(k => `[${k}]: ${process.env[k]||'N/A'}`).join('\n');
        await chunked(msg.channel, '[ENV]', out);
        return;
    }
    // .48 OPEN PORTS
    if (cmd === '.48') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[PORTS]: SCANNING LOCALHOST...`');
        const common = [21,22,23,25,53,80,443,3000,3306,5432,8080,8443,27017];
        const results = await Promise.all(common.map(port => new Promise(resolve => {
            const s = new net.Socket();
            s.setTimeout(500);
            s.on('connect',()=>{s.destroy();resolve(`${port}: OPEN`);});
            s.on('error',()=>{s.destroy();resolve(null);});
            s.on('timeout',()=>{s.destroy();resolve(null);});
            s.connect(port,'127.0.0.1');
        })));
        await m.edit('```fix\n[LOCALHOST PORTS]\n'+(results.filter(Boolean).join('\n')||'NONE OPEN')+'\n```');
        return;
    }
    // .49 DIR LISTING
    if (cmd === '.49') {
        await msg.delete().catch(() => {});
        const m = await msg.channel.send('`[DIR]...`');
        try {
            const isW=process.platform==='win32';
            const out=execSync(isW?'dir /b':'ls -la',{timeout:3000,cwd:process.cwd()}).toString();
            await m.edit('```fix\n[DIR: '+process.cwd()+']\n'+out.trim().split('\n').slice(0,20).join('\n').slice(0,1800)+'\n```');
        } catch { await m.edit('`[DIR]: FAILED`'); }
        return;
    }
    // .50 PASSWORD GEN
    if (cmd === '.50') {
        await msg.delete().catch(() => {});
        const len=Math.min(parseInt(args[1])||16,64);
        const cs='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}';
        let p=''; for(let i=0;i<len;i++) p+=cs[Math.floor(Math.random()*cs.length)];
        await safe(msg.channel, '```fix\n[PASS]\n' + `[LEN]:  ${len}\n[PASS]: ${p}\n` + '```');
        return;
    }
    // .51 HASH
    if (cmd === '.51') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .51 <text>`');
        await safe(msg.channel, '```fix\n[HASH]\n' + `[IN]:     ${t.slice(0,50)}\n[MD5]:    ${crypto.createHash('md5').update(t).digest('hex')}\n[SHA1]:   ${crypto.createHash('sha1').update(t).digest('hex')}\n[SHA256]: ${crypto.createHash('sha256').update(t).digest('hex')}\n` + '```');
        return;
    }
    // .52 B64 ENCODE
    if (cmd === '.52') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .52 <text>`');
        await safe(msg.channel, '```fix\n[B64+]\n' + `[IN]:  ${t.slice(0,50)}\n[OUT]: ${Buffer.from(t).toString('base64').slice(0,500)}\n` + '```');
        return;
    }
    // .53 B64 DECODE
    if (cmd === '.53') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .53 <base64>`');
        try { await safe(msg.channel, '```fix\n[B64-]\n' + `[IN]:  ${t.slice(0,50)}\n[OUT]: ${Buffer.from(t,'base64').toString('utf8').slice(0,500)}\n` + '```'); }
        catch { await msg.channel.send('`[ERR]: INVALID`'); }
        return;
    }
    // .54 IP REPUTATION
    if (cmd === '.54') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .54 <ip>`');
        const m = await msg.channel.send('`[REP]...`');
        try {
            const d=await fetchJSON(`http://ip-api.com/json/${args[1]}?fields=status,query,isp,org,as,proxy,hosting,mobile`);
            await m.edit('```fix\n[IP REP]\n' + `[IP]:      ${d.query}\n[ISP]:     ${d.isp}\n[PROXY]:   ${d.proxy?'YES ⚠':'NO'}\n[HOSTING]: ${d.hosting?'YES ⚠':'NO'}\n[MOBILE]:  ${d.mobile?'YES':'NO'}\n` + '```');
        } catch { await m.edit('`[REP]: FAILED`'); }
        return;
    }
    // .55 UUID GENERATOR
    if (cmd === '.55') {
        await msg.delete().catch(() => {});
        const uuids = Array.from({length:5},()=>crypto.randomUUID()).join('\n');
        await safe(msg.channel, '```fix\n[UUIDs]\n'+uuids+'\n```');
        return;
    }
    // .56 HEX ENCODE
    if (cmd === '.56') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .56 <text>`');
        await safe(msg.channel, '```fix\n[HEX+]\n' + `[IN]:  ${t.slice(0,50)}\n[OUT]: ${Buffer.from(t).toString('hex').slice(0,500)}\n` + '```');
        return;
    }
    // .57 HEX DECODE
    if (cmd === '.57') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .57 <hex>`');
        try { await safe(msg.channel, '```fix\n[HEX-]\n' + `[IN]:  ${t.slice(0,50)}\n[OUT]: ${Buffer.from(t,'hex').toString('utf8').slice(0,500)}\n` + '```'); }
        catch { await msg.channel.send('`[ERR]: INVALID HEX`'); }
        return;
    }
    // .58 ROT13
    if (cmd === '.58') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .58 <text>`');
        const r=t.replace(/[a-zA-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+(c.toLowerCase()<'n'?13:-13)));
        await safe(msg.channel, '```fix\n[ROT13]\n' + `[IN]:  ${t.slice(0,100)}\n[OUT]: ${r.slice(0,100)}\n` + '```');
        return;
    }
    // .59 BINARY ENCODE
    if (cmd === '.59') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .59 <text>`');
        const bin=t.split('').map(c=>c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ');
        await safe(msg.channel, '```fix\n[BIN]\n' + `[IN]:  ${t.slice(0,30)}\n[OUT]: ${bin.slice(0,500)}\n` + '```');
        return;
    }
    // .60 MATRIX RAIN
    if (cmd === '.60') {
        await msg.delete().catch(() => {});
        const chars='アイウエオカキクケコ0123456789ABCDEF';
        const row=()=>Array.from({length:20},()=>chars[Math.floor(Math.random()*chars.length)]).join(' ');
        const m=await msg.channel.send('```\n'+row()+'\n```');
        for(let i=0;i<7;i++){await sleep(600);await m.edit('```\n'+Array.from({length:4},row).join('\n')+'\n```');}
        await m.edit('```fix\n[MATRIX]: CONNECTED.\n```');
        return;
    }
    // .61 GLITCH TEXT
    if (cmd === '.61') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').toUpperCase().slice(0,80)||'EE30';
        const m=await msg.channel.send(`\`${t}\``);
        for(let i=0;i<5;i++){await sleep(400);await m.edit(`\`${glitch(t)}\``);}
        await m.edit(`\`${t}\``);
        return;
    }
    // .62 TYPEWRITER
    if (cmd === '.62') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').slice(0,150)||'EE30 ONLINE.';
        const m=await msg.channel.send('`_`');
        let b='';
        for(const c of t){b+=c;await m.edit(`\`${b}_\``);await sleep(70);}
        await m.edit(`\`${b}\``);
        return;
    }
    // .63 FAKE HACK
    if (cmd === '.63') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').toUpperCase()||'TARGET';
        const steps=[`LOCATING ${t}...`,`3 PORTS OPEN.`,`INJECTING SHELLCODE...`,`FIREWALL DOWN.`,`ROOT OBTAINED.`,`DOWNLOADING... 100%`,`LOGS WIPED.`,`DONE.`];
        const m=await msg.channel.send(`\`[HACK]: ${steps[0]}\``);
        for(let i=1;i<steps.length;i++){await sleep(900);await m.edit(`\`[HACK]: ${steps[i]}\``);}
        return;
    }
    // .64 NUKE
    if (cmd === '.64') {
        await msg.delete().catch(() => {});
        for(const l of ['`[AUTH]: CONFIRMED.`','`[ARM]: WARHEAD ARMED.`','`[T]: 5...4...3...2...1...`','`[LAUNCH]: ████ AWAY ████`','`[IMPACT]: NEUTRALIZED.`']) { await msg.channel.send(l); await sleep(900); }
        return;
    }
    // .65 COIN FLIP
    if (cmd === '.65') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[FLIP]...`');
        await sleep(800);
        await m.edit(`\`[COIN]: ${Math.random()<0.5?'🪙 HEADS':'🪙 TAILS'}\``);
        return;
    }
    // .66 DICE ROLL
    if (cmd === '.66') {
        await msg.delete().catch(() => {});
        const s=Math.min(parseInt(args[1])||6,100);
        const m=await msg.channel.send('`[ROLL]...`');
        await sleep(600);
        await m.edit(`\`[DICE]: ${Math.floor(Math.random()*s)+1}/D${s}\``);
        return;
    }
    // .67 RANDOM FACT
    if (cmd === '.67') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[FACT]...`');
        try { const d=await fetchJSON('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en'); await m.edit('```fix\n[FACT]\n'+d.text.slice(0,900)+'\n```'); }
        catch { await m.edit('`[FACT]: FAILED`'); }
        return;
    }
    // .68 JOKE
    if (cmd === '.68') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[JOKE]...`');
        try { const d=await fetchJSON('https://official-joke-api.appspot.com/random_joke'); await m.edit('```fix\n[JOKE]\nQ: '+d.setup.slice(0,300)+'\nA: '+d.punchline.slice(0,300)+'\n```'); }
        catch { await m.edit('`[JOKE]: FAILED`'); }
        return;
    }
    // .69 8BALL
    if (cmd === '.69') {
        await msg.delete().catch(() => {});
        const q=args.slice(1).join(' ');
        if (!q) return msg.channel.send('`[ERR]: .69 <question>`');
        const r=['CERTAIN.','DECIDEDLY SO.','YES.','MOST LIKELY.','OUTLOOK GOOD.','ASK AGAIN.','CANNOT PREDICT.','NO.','VERY DOUBTFUL.','ABSOLUTELY NOT.'];
        const m=await msg.channel.send('`[🎱]...`');
        await sleep(1000);
        await m.edit('```fix\n[8BALL]\n[Q]: '+q.slice(0,200)+'\n[A]: '+r[Math.floor(Math.random()*r.length)]+'\n```');
        return;
    }
    // .70 ASCII LOGO
    if (cmd === '.70') {
        await msg.delete().catch(() => {});
        await msg.channel.send('```\n _____ _____ ____  ___  \n| ____|  ___| __ )|__ \\\n|  _| | |_  |  _ \\  / /\n| |___|  _| | |_) |/ /_\n|_____|_|   |____/|____|\n TERMINAL V6.0\n```');
        return;
    }
    // .71 ASCII BANNER
    if (cmd === '.71') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').toUpperCase().slice(0,10)||'EE30';
        await msg.channel.send('```\n'+t.split('').map(c=>BLOCK[c]?.[0]??'?').join(' ')+'\n'+t.split('').map(c=>BLOCK[c]?.[1]??'?').join(' ')+'\n```');
        return;
    }
    // .72 SELF DESTRUCT
    if (cmd === '.72') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[DESTRUCT]: INITIATED.`');
        for(const f of ['IRREVERSIBLE.','5...','4...','3...','2...','1...','💥 DESTROYED.']){await sleep(800);await m.edit(`\`[DESTRUCT]: ${f}\``);}
        return;
    }
    // .73 BOOT SEQUENCE
    if (cmd === '.73') {
        await msg.delete().catch(() => {});
        const lines=['EE30-OS LOADING...','BIOS: OK','RAM: OK','KERNEL: DONE','FS: OK','NET: OK','CRYPT: OK','> READY.'];
        const m=await msg.channel.send('```fix\n'+lines[0]+'\n```');
        let built=lines[0];
        for(let i=1;i<lines.length;i++){await sleep(700);built+='\n'+lines[i];await m.edit('```fix\n'+built+'\n```');}
        return;
    }
    // .74 ROULETTE
    if (cmd === '.74') {
        await msg.delete().catch(() => {});
        if (!msg.guild) return;
        await msg.guild.members.fetch();
        const humans=msg.guild.members.cache.filter(m=>!m.user.bot).map(m=>m.user.username);
        if (!humans.length) return msg.channel.send('`[ERR]: NO PLAYERS`');
        const v=humans[Math.floor(Math.random()*humans.length)];
        const m=await msg.channel.send('`[ROULETTE]: SPINNING...`');
        await sleep(800); await m.edit('`[ROULETTE]: 🔫 AIMING...`');
        await sleep(1200); await m.edit('`[ROULETTE]: BANG.`');
        await sleep(600); await m.edit(`\`[ROULETTE]: 💀 ${v} ELIMINATED.\``);
        return;
    }
    // .80 WEATHER
    if (cmd === '.80') {
        await msg.delete().catch(() => {});
        const city=args.slice(1).join(' ');
        if (!city) return msg.channel.send('`[ERR]: .80 <city>`');
        const m=await msg.channel.send('`[WX]...`');
        try {
            const geo=await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
            if (!geo.results?.length) return m.edit('`[WX]: CITY NOT FOUND`');
            const {latitude,longitude,name,country}=geo.results[0];
            const wx=await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&forecast_days=1`);
            const w=wx.current_weather;
            const codes={0:'CLEAR',1:'MOSTLY CLEAR',2:'PARTLY CLOUDY',3:'OVERCAST',45:'FOGGY',61:'RAIN',71:'SNOW',80:'SHOWERS',95:'STORM'};
            await m.edit('```fix\n[WEATHER]\n' + `[CITY]:   ${name}, ${country}\n[TEMP]:   ${w.temperature}°C\n[WIND]:   ${w.windspeed}km/h\n[STATUS]: ${codes[w.weathercode]??'CODE '+w.weathercode}\n` + '```');
        } catch { await m.edit('`[WX]: FAILED`'); }
        return;
    }
    // .81 CALCULATOR
    if (cmd === '.81') {
        await msg.delete().catch(() => {});
        const expr=args.slice(1).join('');
        if (!expr) return msg.channel.send('`[ERR]: .81 <expr>`');
        try {
            if (!/^[\d\s\+\-\*\/\.\(\)\%\^]+$/.test(expr)) throw new Error('invalid');
            const result=Function(`"use strict";return(${expr.replace(/\^/g,'**')})`)();
            await safe(msg.channel, '```fix\n[CALC]\n' + `[EXPR]:   ${expr}\n[RESULT]: ${result}\n` + '```');
        } catch { await msg.channel.send('`[ERR]: INVALID EXPR`'); }
        return;
    }
    // .82 URBAN DICTIONARY
    if (cmd === '.82') {
        await msg.delete().catch(() => {});
        const term=args.slice(1).join(' ');
        if (!term) return msg.channel.send('`[ERR]: .82 <term>`');
        const m=await msg.channel.send('`[UD]...`');
        try {
            const d=await fetchJSON(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
            if (!d.list?.length) return m.edit('`[UD]: NO RESULTS`');
            const top=d.list[0];
            await m.edit('```fix\n[UD: '+term.toUpperCase()+']\n[DEF]: '+top.definition.replace(/[\[\]]/g,'').slice(0,400)+'\n[EX]:  '+top.example.replace(/[\[\]]/g,'').slice(0,150)+'\n[👍]:  '+top.thumbs_up+'  [👎]: '+top.thumbs_down+'\n```');
        } catch { await m.edit('`[UD]: FAILED`'); }
        return;
    }
    // .83 STEAM PROFILE
    if (cmd === '.83') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .83 <steamid64>`');
        const m=await msg.channel.send('`[STEAM]...`');
        try {
            const xml=await fetchText(`https://steamcommunity.com/profiles/${args[1]}/?xml=1`);
            const get=tag=>{const r=xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([^\\]]+)\\]\\]><\\/${tag}>`));return r?r[1]:(xml.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`))||[])[1]||'N/A';};
            await m.edit('```fix\n[STEAM]\n' + `[NAME]:   ${get('steamID')}\n[STATUS]: ${get('onlineState').toUpperCase()}\n[SINCE]:  ${get('memberSince')}\n` + '```');
        } catch { await m.edit('`[STEAM]: FAILED`'); }
        return;
    }
    // .84 CRYPTO PRICE
    if (cmd === '.84') {
        await msg.delete().catch(() => {});
        const coin=(args[1]||'bitcoin').toLowerCase();
        const m=await msg.channel.send('`[CRYPTO]...`');
        try {
            const d=await fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_24hr_change=true`);
            if (!d[coin]) return m.edit('`[CRYPTO]: NOT FOUND`');
            await m.edit('```fix\n[CRYPTO]\n' + `[COIN]:  ${coin.toUpperCase()}\n[PRICE]: $${d[coin].usd.toLocaleString()}\n[24H]:   ${d[coin].usd_24h_change?.toFixed(2)}%\n` + '```');
        } catch { await m.edit('`[CRYPTO]: FAILED`'); }
        return;
    }
    // .85 COUNTRY INFO
    if (cmd === '.85') {
        await msg.delete().catch(() => {});
        const country=args.slice(1).join(' ');
        if (!country) return msg.channel.send('`[ERR]: .85 <country>`');
        const m=await msg.channel.send('`[COUNTRY]...`');
        try {
            const d=await fetchJSON(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fullText=false`);
            const c=d[0];
            await m.edit('```fix\n[COUNTRY]\n' + `[NAME]:     ${c.name.common}\n[CAPITAL]:  ${c.capital?.[0]??'N/A'}\n[REGION]:   ${c.region}\n[POP]:      ${c.population.toLocaleString()}\n[CURRENCY]: ${Object.keys(c.currencies||{})[0]??'N/A'}\n[LANG]:     ${Object.values(c.languages||{})[0]??'N/A'}\n` + '```');
        } catch { await m.edit('`[COUNTRY]: NOT FOUND`'); }
        return;
    }
    // .86 CAT FACT
    if (cmd === '.86') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[CAT]...`');
        try { const d=await fetchJSON('https://catfact.ninja/fact'); await m.edit('```fix\n[CAT FACT]\n'+d.fact+'\n```'); }
        catch { await m.edit('`[CAT]: FAILED`'); }
        return;
    }
    // .87 DOG FACT
    if (cmd === '.87') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[DOG]...`');
        try { const d=await fetchJSON('https://dogapi.dog/api/v2/facts?limit=1'); await m.edit('```fix\n[DOG FACT]\n'+(d.data?.[0]?.attributes?.body||'N/A')+'\n```'); }
        catch { await m.edit('`[DOG]: FAILED`'); }
        return;
    }
    // .88 QR CODE LINK
    if (cmd === '.88') {
        await msg.delete().catch(() => {});
        const text=args.slice(1).join(' ');
        if (!text) return msg.channel.send('`[ERR]: .88 <text>`');
        await safe(msg.channel, '```fix\n[QR]\n' + `[DATA]: ${text.slice(0,100)}\n[URL]:  https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}\n` + '```');
        return;
    }
    // .89 TIMEZONE
    if (cmd === '.89') {
        await msg.delete().catch(() => {});
        const tz=args.slice(1).join('_')||'UTC';
        try {
            const now=new Date().toLocaleString('en-US',{timeZone:tz,dateStyle:'full',timeStyle:'long'});
            await safe(msg.channel, '```fix\n[TIME]\n' + `[ZONE]: ${tz}\n[NOW]:  ${now}\n` + '```');
        } catch { await msg.channel.send('`[ERR]: INVALID TIMEZONE`'); }
        return;
    }
    // .90 WORD DEFINITION
    if (cmd === '.90') {
        await msg.delete().catch(() => {});
        const word=args[1];
        if (!word) return msg.channel.send('`[ERR]: .90 <word>`');
        const m=await msg.channel.send('`[DEF]...`');
        try {
            const d=await fetchJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
            const def=d[0].meanings?.[0]?.definitions?.[0]?.definition||'N/A';
            const pos=d[0].meanings?.[0]?.partOfSpeech||'N/A';
            await m.edit('```fix\n[DEFINE: '+word.toUpperCase()+']\n[TYPE]: '+pos+'\n[DEF]:  '+def.slice(0,400)+'\n```');
        } catch { await m.edit('`[DEF]: NOT FOUND`'); }
        return;
    }
    // .91 GITHUB USER
    if (cmd === '.91') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .91 <username>`');
        const m=await msg.channel.send('`[GH]...`');
        try {
            const d=await fetchJSON(`https://api.github.com/users/${args[1]}`);
            await m.edit('```fix\n[GITHUB USER]\n' + `[NAME]:      ${d.name||'N/A'}\n[LOGIN]:     ${d.login}\n[REPOS]:     ${d.public_repos}\n[FOLLOWERS]: ${d.followers}\n[CREATED]:   ${new Date(d.created_at).toDateString()}\n[BIO]:       ${(d.bio||'N/A').slice(0,100)}\n` + '```');
        } catch { await m.edit('`[GH]: NOT FOUND`'); }
        return;
    }
    // .92 GITHUB REPO
    if (cmd === '.92') {
        await msg.delete().catch(() => {});
        const repo=args.slice(1).join(' ');
        if (!repo||!repo.includes('/')) return msg.channel.send('`[ERR]: .92 <user/repo>`');
        const m=await msg.channel.send('`[GH REPO]...`');
        try {
            const d=await fetchJSON(`https://api.github.com/repos/${repo}`);
            await m.edit('```fix\n[GITHUB REPO]\n' + `[NAME]:    ${d.full_name}\n[DESC]:    ${(d.description||'N/A').slice(0,100)}\n[STARS]:   ${d.stargazers_count}\n[FORKS]:   ${d.forks_count}\n[LANG]:    ${d.language||'N/A'}\n[UPDATED]: ${new Date(d.updated_at).toDateString()}\n` + '```');
        } catch { await m.edit('`[GH]: NOT FOUND`'); }
        return;
    }
    // .93 IP GEO MAP
    if (cmd === '.93') {
        await msg.delete().catch(() => {});
        if (!args[1]) return msg.channel.send('`[ERR]: .93 <ip>`');
        const m=await msg.channel.send('`[GEO]...`');
        try {
            const d=await fetchJSON(`http://ip-api.com/json/${args[1]}`);
            await m.edit('```fix\n[GEO]\n' + `[IP]:    ${d.query}\n[CITY]:  ${d.city}, ${d.country}\n[COORD]: ${d.lat}, ${d.lon}\n[MAP]:   https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}&zoom=10\n` + '```');
        } catch { await m.edit('`[GEO]: FAILED`'); }
        return;
    }
    // .94 COLOR INFO
    if (cmd === '.94') {
        await msg.delete().catch(() => {});
        const hex=(args[1]||'').replace('#','');
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return msg.channel.send('`[ERR]: .94 <hex>  e.g. .94 ff5500`');
        const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
        await safe(msg.channel, '```fix\n[COLOR]\n' + `[HEX]: #${hex.toUpperCase()}\n[RGB]: ${r}, ${g}, ${b}\n[URL]: https://www.color-hex.com/color/${hex}\n` + '```');
        return;
    }
    // .95 UUID INFO
    if (cmd === '.95') {
        await msg.delete().catch(() => {});
        const uuid=args[1];
        if (!uuid) return msg.channel.send('`[ERR]: .95 <uuid>`');
        await safe(msg.channel, '```fix\n[UUID]\n' + `[VALUE]:   ${uuid}\n[VERSION]: ${uuid[14]||'?'}\n[VALID]:   ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)?'YES':'NO'}\n` + '```');
        return;
    }
    // .96 MOCK TEXT
    if (cmd === '.96') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .96 <text>`');
        await safe(msg.channel, t.split('').map((c,i)=>i%2===0?c.toLowerCase():c.toUpperCase()).join('').slice(0,200));
        return;
    }
    // .97 LEET SPEAK
    if (cmd === '.97') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .97 <text>`');
        const map={a:'4',e:'3',g:'9',i:'1',o:'0',s:'5',t:'7',b:'8'};
        await safe(msg.channel, '`[1337]: '+t.toLowerCase().split('').map(c=>map[c]||c).join('').slice(0,200)+'`');
        return;
    }
    // .98 REVERSE TEXT
    if (cmd === '.98') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .98 <text>`');
        await safe(msg.channel, '`[REV]: '+t.split('').reverse().join('').slice(0,200)+'`');
        return;
    }
    // .99 WORD COUNT
    if (cmd === '.99') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .99 <text>`');
        await safe(msg.channel, '```fix\n[WORDCOUNT]\n' + `[WORDS]:     ${t.trim().split(/\s+/).length}\n[CHARS]:     ${t.length}\n[SENTENCES]: ${t.split(/[.!?]+/).filter(Boolean).length}\n` + '```');
        return;
    }
    // .101 WOULD YOU RATHER
    if (cmd === '.101') {
        await msg.delete().catch(() => {});
        const opts=[['fly','be invisible'],['never sleep','never eat'],['fight 100 ducks','1 horse-sized duck'],['be a hacker','be a spy'],['unlimited money','unlimited power'],['live in space','live underwater'],['know the future','change the past']];
        const pick=opts[Math.floor(Math.random()*opts.length)];
        await safe(msg.channel, '```fix\n[WOULD YOU RATHER]\n[A]: '+pick[0].toUpperCase()+'\n[B]: '+pick[1].toUpperCase()+'\n```');
        return;
    }
    // .102 TRIVIA
    if (cmd === '.102') {
        await msg.delete().catch(() => {});
        const m=await msg.channel.send('`[TRIVIA]...`');
        try {
            const d=await fetchJSON('https://opentdb.com/api.php?amount=1&type=multiple');
            const q=d.results[0];
            const ans=[...q.incorrect_answers,q.correct_answer].sort(()=>Math.random()-0.5);
            await m.edit('```fix\n[TRIVIA]\n[Q]:   '+q.question.replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').slice(0,200)+'\n[ANS]: '+ans.map((a,i)=>`${i+1}.${a}`).join('  ')+'\n```');
        } catch { await m.edit('`[TRIVIA]: FAILED`'); }
        return;
    }
    // .103 NUMBER GUESS
    if (cmd === '.103') {
        await msg.delete().catch(() => {});
        const n=Math.floor(Math.random()*100)+1;
        const m=await msg.channel.send('`[GUESS]: PICK 1-100...`');
        await sleep(2000);
        await m.edit(`\`[GUESS]: The number was ${n}!\``);
        return;
    }
    // .104 MORSE ENCODE
    if (cmd === '.104') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').toUpperCase();
        if (!t) return msg.channel.send('`[ERR]: .104 <text>`');
        const morse={'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',' ':'/'};
        await safe(msg.channel, '```fix\n[MORSE]\n[IN]:  '+t.slice(0,50)+'\n[OUT]: '+t.split('').map(c=>morse[c]||'?').join(' ').slice(0,400)+'\n```');
        return;
    }
    // .105 MORSE DECODE
    if (cmd === '.105') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .105 <morse>`');
        const rm={'.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z','-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9','/':' '};
        await safe(msg.channel, '```fix\n[MORSE DECODE]\n[IN]:  '+t.slice(0,100)+'\n[OUT]: '+t.split(' ').map(c=>rm[c]||'?').join('')+'\n```');
        return;
    }
    // .106 ZALGO TEXT
    if (cmd === '.106') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').slice(0,50);
        if (!t) return msg.channel.send('`[ERR]: .106 <text>`');
        const zUp=['\u0300','\u0301','\u0302','\u0303','\u0308','\u030a','\u030b','\u030d','\u0311','\u0312'];
        const out=t.split('').map(c=>c+Array.from({length:Math.floor(Math.random()*3)+1},()=>zUp[Math.floor(Math.random()*zUp.length)]).join('')).join('');
        await msg.channel.send(out.slice(0,500));
        return;
    }
    // .107 CLAP TEXT
    if (cmd === '.107') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ');
        if (!t) return msg.channel.send('`[ERR]: .107 <text>`');
        await safe(msg.channel, t.split(' ').join(' 👏 '));
        return;
    }
    // .108 TINY TEXT
    if (cmd === '.108') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').toLowerCase();
        if (!t) return msg.channel.send('`[ERR]: .108 <text>`');
        const tiny='ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖᵠʳˢᵗᵘᵛʷˣʸᶻ';
        await safe(msg.channel, t.split('').map(c=>{const i=c.charCodeAt(0)-97;return i>=0&&i<26?tiny[i]:c;}).join('').slice(0,200));
        return;
    }
    // .109 VAPORWAVE TEXT
    if (cmd === '.109') {
        await msg.delete().catch(() => {});
        const t=args.slice(1).join(' ').toUpperCase();
        if (!t) return msg.channel.send('`[ERR]: .109 <text>`');
        await safe(msg.channel, t.split('').map(c=>{const code=c.charCodeAt(0);return(code>=33&&code<=126)?String.fromCharCode(code+65248):c;}).join('').slice(0,200));
        return;
    }
    // .110 COMPLIMENT
    if (cmd === '.110') {
        await msg.delete().catch(() => {});
        const list=['You are an absolute legend.','Your code is cleaner than most.','You have the energy of a server with 100% uptime.','You debug faster than most people think.','Your terminal aesthetic is elite.','You are the root user of this friend group.','Genuinely built different.'];
        await safe(msg.channel, '`[💚]: '+list[Math.floor(Math.random()*list.length)]+'`');
        return;
    }
    // .111 INSULT GEN
    if (cmd === '.111') {
        await msg.delete().catch(() => {});
        const adj=['404','deprecated','buffering','laggy','outdated','null','segfaulting','rate-limited'];
        const noun=['script','README','binary','cron job','hotfix','deployment','packet','endpoint'];
        await safe(msg.channel, '`[🔥]: You absolute '+adj[Math.floor(Math.random()*adj.length)]+' '+noun[Math.floor(Math.random()*noun.length)]+'`');
        return;
    }
    // .112 SHIP NAMES
    if (cmd === '.112') {
        await msg.delete().catch(() => {});
        const [n1,n2]=[args[1],args[2]];
        if (!n1||!n2) return msg.channel.send('`[ERR]: .112 <name1> <name2>`');
        const pct=Math.floor(Math.random()*101);
        const ship=n1.slice(0,Math.ceil(n1.length/2))+n2.slice(Math.floor(n2.length/2));
        await safe(msg.channel, '```fix\n[SHIP]\n[PAIR]:  '+n1+' + '+n2+'\n[NAME]:  '+ship+'\n[SCORE]: '+pct+'%\n```');
        return;
    }
    // .113 RATE THING
    if (cmd === '.113') {
        await msg.delete().catch(() => {});
        const thing=args.slice(1).join(' ');
        if (!thing) return msg.channel.send('`[ERR]: .113 <thing>`');
        const score=(Math.random()*10).toFixed(1);
        const bars='█'.repeat(Math.round(score))+'░'.repeat(10-Math.round(score));
        await safe(msg.channel, '```fix\n[RATE]\n[THING]: '+thing+'\n[SCORE]: '+score+'/10\n[BAR]:   ['+bars+']\n```');
        return;
    }
    // .114 NEVER HAVE I EVER
    if (cmd === '.114') {
        await msg.delete().catch(() => {});
        const list=['never have I ever hacked a Wi-Fi network.','never have I ever pulled an all-nighter coding.','never have I ever pushed to main directly.','never have I ever deleted the prod database.','never have I ever used "password" as a password.','never have I ever read the terms and conditions.','never have I ever used 100 tabs at once.'];
        await safe(msg.channel, '`[🙋]: '+list[Math.floor(Math.random()*list.length)]+'`');
        return;
    }
    // .115 TRUTH OR DARE
    if (cmd === '.115') {
        await msg.delete().catch(() => {});
        const truths=['What is your most used terminal command?','Have you ever social engineered someone?','What is the worst bug you ever shipped?'];
        const dares=['Send a message entirely in binary.','Change your status to "I love IE6" for 1 hour.','Rickroll someone in the next 5 minutes.'];
        const isTruth=Math.random()<0.5;
        const list=isTruth?truths:dares;
        await safe(msg.channel, '`['+(isTruth?'TRUTH':'DARE')+']: '+list[Math.floor(Math.random()*list.length)]+'`');
        return;
    }
    // .116 ROCK PAPER SCISSORS
    if (cmd === '.116') {
        await msg.delete().catch(() => {});
        const choices=['rock','paper','scissors'];
        const user=(args[1]||'').toLowerCase();
        if (!choices.includes(user)) return msg.channel.send('`[ERR]: .116 rock/paper/scissors`');
        const bot=choices[Math.floor(Math.random()*3)];
        const wins={rock:'scissors',paper:'rock',scissors:'paper'};
        const result=wins[user]===bot?'YOU WIN 🏆':bot===user?'DRAW 🤝':'BOT WINS 💀';
        await safe(msg.channel, '```fix\n[RPS]\n[YOU]:    '+user.toUpperCase()+'\n[BOT]:    '+bot.toUpperCase()+'\n[RESULT]: '+result+'\n```');
        return;
    }
    // .117 RANDOM COLOR
    if (cmd === '.117') {
        await msg.delete().catch(() => {});
        const hex=Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
        const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
        await safe(msg.channel, '```fix\n[COLOR]\n[HEX]: #'+hex.toUpperCase()+'\n[RGB]: '+r+', '+g+', '+b+'\n[URL]: https://www.color-hex.com/color/'+hex+'\n```');
        return;
    }
    // .118 FAKE TWEET
    if (cmd === '.118') {
        await msg.delete().catch(() => {});
        const handle=args[1]||'user';
        const text=args.slice(2).join(' ')||'...';
        await safe(msg.channel, '```fix\n[TWEET]\n[@'+handle+']: '+text.slice(0,280)+'\n[❤️]:  '+Math.floor(Math.random()*100000).toLocaleString()+'   [🔁]: '+Math.floor(Math.random()*50000).toLocaleString()+'\n```');
        return;
    }
    // .119 PROGRESS BAR
    if (cmd === '.119') {
        await msg.delete().catch(() => {});
        const pct=Math.min(Math.max(parseInt(args[1])||50,0),100);
        const filled=Math.round(pct/5);
        await safe(msg.channel, '`['+'█'.repeat(filled)+'░'.repeat(20-filled)+'] '+pct+'%`');
        return;
    }
    // .120 HYPE TRAIN
    if (cmd === '.120') {
        await msg.delete().catch(() => {});
        const frames=['🚂','🚂💨','🚂💨💨','🚂💨💨💨 CHOO CHOO','🚂💨💨💨 HYPE TRAIN INCOMING!!!','🔥🚂💨 L E T S G O 🔥'];
        const m=await msg.channel.send('`'+frames[0]+'`');
        for(let i=1;i<frames.length;i++){await sleep(600);await m.edit('`'+frames[i]+'`');}
        return;
    }

    // ══════════════════════════════════════
    // AI COMMANDS (Groq — free)
    // ══════════════════════════════════════

    // .200 AI ROAST  usage: .200 <target>
    if (cmd === '.200') {
        await msg.delete().catch(() => {});
        const target = args.slice(1).join(' ');
        if (!target) return msg.channel.send('`[ERR]: .200 <target>`');
        const m = await msg.channel.send('`[AI ROAST]: GENERATING...`');
        try {
            const res = await groq(
                `You are a savage, witty roast comedian in the style of a hacker terminal.
Roast the given target HARD. Be creative, specific, and brutally funny.
Keep it under 3 sentences. No asterisks, no formatting, no emojis.
Plain text only. Funny > mean. Tech and internet culture references encouraged.`,
                `Roast: ${target}`
            );
            if (res.error) return m.edit('`[AI ROAST]: ERR — ' + String(res.error.message).slice(0, 100) + '`');
            const roast = res.choices?.[0]?.message?.content?.trim();
            if (!roast) return m.edit('`[AI ROAST]: NO RESPONSE — ' + JSON.stringify(res).slice(0, 120) + '`');
            await m.edit('```fix\n[🔥 AI ROAST: ' + target.toUpperCase().slice(0, 30) + ']\n' + roast.slice(0, 800) + '\n```');
        } catch (e) { await m.edit('`[AI ROAST]: FAILED — ' + String(e).slice(0, 100) + '`'); }
        return;
    }

    // .201 AI CHAT  usage: .201 <message>
    if (cmd === '.201') {
        await msg.delete().catch(() => {});
        const question = args.slice(1).join(' ');
        if (!question) return msg.channel.send('`[ERR]: .201 <message>`');
        const m = await msg.channel.send('`[AI]: THINKING...`');
        try {
            const res = await groq(
                `You are EE30, a hacker-terminal AI assistant embedded in a Discord bot.
Reply in a direct, slightly snarky, efficient style.
No markdown, no bullet points — plain terminal text only.
Keep responses concise (under 4 sentences unless the question demands more).`,
                question,
                400
            );
            if (res.error) return m.edit('`[AI]: ERR — ' + String(res.error.message).slice(0, 100) + '`');
            const reply = res.choices?.[0]?.message?.content?.trim();
            if (!reply) return m.edit('`[AI]: NO RESPONSE — ' + JSON.stringify(res).slice(0, 120) + '`');
            await m.edit('```fix\n[AI]\n[Q]: ' + question.slice(0, 200) + '\n[A]: ' + reply.slice(0, 800) + '\n```');
        } catch (e) { await m.edit('`[AI]: FAILED — ' + String(e).slice(0, 100) + '`'); }
        return;
    }

    // .202 AI TRIVIA  usage: .202 [topic]
    if (cmd === '.202') {
        await msg.delete().catch(() => {});
        const topic = args.slice(1).join(' ') || 'random';
        const m = await msg.channel.send('`[AI TRIVIA]: GENERATING...`');
        try {
            const res = await groq(
                `You generate trivia questions. Reply with ONLY this exact format, no extra text:
Q: <question>
A: <answer>
FACT: <one interesting extra fact about the answer>`,
                `Generate a trivia question about: ${topic}`
            );
            if (res.error) return m.edit('`[AI TRIVIA]: ERR — ' + String(res.error.message).slice(0, 100) + '`');
            const text = res.choices?.[0]?.message?.content?.trim();
            if (!text) return m.edit('`[AI TRIVIA]: NO RESPONSE`');
            await m.edit('```fix\n[🧠 AI TRIVIA: ' + topic.toUpperCase().slice(0, 25) + ']\n' + text.slice(0, 800) + '\n```');
        } catch (e) { await m.edit('`[AI TRIVIA]: FAILED — ' + String(e).slice(0, 100) + '`'); }
        return;
    }

});

client.login(TOKEN);