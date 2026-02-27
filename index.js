const { Client, GatewayIntentBits } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
} = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const https = require('https');
const express = require('express');

// ===== EXPRESS SERVER =====
const app = express();
const port = process.env.PORT || 3000;

let botReady = false;
let botError = '';

app.get('/', (req, res) => {
    res.send(`
    <html><head><title>T3N Voice Bot</title>
    <style>
        body { background: #1a1a2e; color: #eee; font-family: Arial; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .box { background: #16213e; padding: 30px; border-radius: 12px; text-align: center; max-width: 500px; width: 90%; }
        h1 { color: #e94560; }
        .status { padding: 10px; border-radius: 8px; margin: 10px 0; font-size: 18px; }
        .online { background: #0f3d0f; color: #4caf50; }
        .offline { background: #3d0f0f; color: #f44336; }
        .error { background: #3d3d0f; color: #ff9800; font-size: 14px; padding: 8px; margin-top: 10px; border-radius: 6px; }
    </style></head>
    <body><div class="box">
        <h1>🎵 T3N Voice Bot</h1>
        <div class="status ${botReady ? 'online' : 'offline'}">
            ${botReady ? '🟢 Bot Connected!' : '🔴 Bot Not Connected'}
        </div>
        <p>Uptime: ${Math.floor(process.uptime())}s</p>
        ${botError ? `<div class="error">⚠️ ${botError}</div>` : ''}
    </div></body></html>
    `);
});

app.get('/health', (req, res) => res.json({ status: botReady ? 'connected' : 'disconnected', error: botError, uptime: process.uptime() }));

app.listen(port, '0.0.0.0', () => console.log(`🌐 Server on port ${port}`));

// ===== TEST TOKEN VIA REST API =====
function testToken(token) {
    return new Promise((resolve, reject) => {
        const req = https.get('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': `Bot ${token}` }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Token invalid! HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

// ===== CONFIGURATION =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const VOICE_CHANNEL_ID = '1396967239948701859';
const WELCOME_SOUND = path.join(__dirname, 'welcome.wav');

console.log("======= T3N VOICE BOT =======");
console.log("Token set:", !!DISCORD_BOT_TOKEN);
console.log("Sound exists:", fs.existsSync(WELCOME_SOUND));
console.log("Node:", process.version);

if (!DISCORD_BOT_TOKEN) {
    botError = 'DISCORD_BOT_TOKEN not set in Render Environment!';
    console.error("❌", botError);
} else {
    // First test token via REST, then login
    startBot();
}

async function startBot() {
    // Step 1: Test token via REST API
    console.log("🔍 Testing token via Discord REST API...");
    try {
        const botUser = await testToken(DISCORD_BOT_TOKEN);
        console.log(`✅ Token VALID! Bot: ${botUser.username}#${botUser.discriminator} (ID: ${botUser.id})`);
    } catch (err) {
        botError = `Token INVALID: ${err.message}`;
        console.error("❌ TOKEN TEST FAILED:", err.message);
        console.error("⚠️  Go to Discord Developer Portal -> Bot -> Reset Token -> Update in Render");
        return; // Don't try to login with bad token
    }

    // Step 2: Login via Gateway
    console.log("🔑 Token valid! Connecting to Discord Gateway...");

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    let voiceConnection = null;
    let isPlaying = false;

    // ===== JOIN VOICE CHANNEL =====
    async function joinChannel() {
        try {
            const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
            if (!channel) {
                console.error("❌ Voice channel not found:", VOICE_CHANNEL_ID);
                const vc = client.channels.cache.filter(c => c.type === 2);
                console.log("Available voice channels:", vc.map(c => `${c.name}(${c.id})`).join(', '));
                return;
            }

            console.log("🎙️ Joining:", channel.name);

            voiceConnection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: true,
            });

            voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000);
                } catch {
                    voiceConnection.destroy();
                    voiceConnection = null;
                    setTimeout(joinChannel, 5000);
                }
            });

            voiceConnection.on(VoiceConnectionStatus.Ready, () => {
                console.log("✅ Voice connected:", channel.name);
            });
        } catch (err) {
            console.error("❌ Join error:", err.message);
        }
    }

    // ===== PLAY SOUND =====
    function playWelcomeSound() {
        if (!voiceConnection || isPlaying) return;
        try {
            const player = createAudioPlayer();
            const resource = createAudioResource(WELCOME_SOUND);
            isPlaying = true;
            player.play(resource);
            voiceConnection.subscribe(player);
            player.on(AudioPlayerStatus.Idle, () => { isPlaying = false; });
            player.on('error', (e) => { console.error("Audio err:", e.message); isPlaying = false; });
            console.log("🔊 Playing sound!");
        } catch (e) {
            console.error("Play err:", e.message);
            isPlaying = false;
        }
    }

    // ===== EVENTS =====
    client.on('ready', async () => {
        botReady = true;
        botError = '';
        console.log(`✅ BOT ONLINE! ${client.user.tag} | ${client.guilds.cache.size} servers`);
        client.user.setPresence({ activities: [{ name: '🎵 T3N', type: 2 }], status: 'online' });
        await joinChannel();
    });

    client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.channelId === VOICE_CHANNEL_ID && oldState.channelId !== VOICE_CHANNEL_ID) {
            if (newState.member.user.bot) return;
            console.log(`👤 ${newState.member.user.tag} joined!`);
            if (!voiceConnection) {
                joinChannel().then(() => setTimeout(playWelcomeSound, 500));
            } else {
                playWelcomeSound();
            }
        }
    });

    client.on('error', (e) => { console.error('Client err:', e.message); botError = e.message; });

    // ===== LOGIN =====
    try {
        await client.login(DISCORD_BOT_TOKEN);
        console.log("🔑 Gateway login success!");
    } catch (err) {
        botError = `Gateway login failed: ${err.message}`;
        console.error("❌ GATEWAY FAILED:", err.message);
    }
}

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Exception:', e));
