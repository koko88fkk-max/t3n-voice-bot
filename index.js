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
        .error { background: #3d3d0f; color: #ff9800; font-size: 14px; padding: 8px; margin-top: 10px; border-radius: 6px; word-break: break-all; }
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

// ===== CONFIGURATION =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const VOICE_CHANNEL_ID = '1396967239948701859';
const WELCOME_SOUND = path.join(__dirname, 'welcome.wav');

console.log("======= T3N VOICE BOT =======");
console.log("Token set:", !!DISCORD_BOT_TOKEN);
console.log("Sound exists:", fs.existsSync(WELCOME_SOUND));

if (!DISCORD_BOT_TOKEN) {
    botError = 'DISCORD_BOT_TOKEN not set!';
    console.error("❌", botError);
} else {
    // Wait 15 seconds before connecting to avoid Discord rate limits
    console.log("⏳ Waiting 15 seconds before connecting (avoid rate limit)...");
    setTimeout(startBot, 15000);
}

async function startBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    let voiceConnection = null;
    let isPlaying = false;

    async function joinChannel() {
        try {
            const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
            if (!channel) {
                console.error("❌ Voice channel not found:", VOICE_CHANNEL_ID);
                return;
            }

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

    function playWelcomeSound() {
        if (!voiceConnection || isPlaying) return;
        try {
            const player = createAudioPlayer();
            const resource = createAudioResource(WELCOME_SOUND);
            isPlaying = true;
            player.play(resource);
            voiceConnection.subscribe(player);
            player.on(AudioPlayerStatus.Idle, () => { isPlaying = false; console.log("🔇 Sound done."); });
            player.on('error', (e) => { console.error("Audio err:", e.message); isPlaying = false; });
            console.log("🔊 Playing sound!");
        } catch (e) {
            console.error("Play err:", e.message);
            isPlaying = false;
        }
    }

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

    // LOGIN with retry
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`🔑 Login attempt ${attempt}/3...`);
            await client.login(DISCORD_BOT_TOKEN);
            console.log("✅ LOGIN SUCCESS!");
            return; // Success!
        } catch (err) {
            console.error(`❌ Attempt ${attempt} failed:`, err.message);
            botError = `Login failed: ${err.message}`;
            if (attempt < 3) {
                const waitTime = attempt * 15000; // 15s, 30s
                console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }
    console.error("❌ ALL LOGIN ATTEMPTS FAILED. Token is likely revoked.");
    botError = "All login attempts failed. Reset token in Discord Developer Portal.";
}

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Exception:', e));
