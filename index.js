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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #333; border-radius: 8px; background: #0f3460; color: #fff; font-size: 16px; box-sizing: border-box; }
        button { background: #e94560; color: #fff; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; }
        button:hover { background: #c73e54; }
    </style></head>
    <body><div class="box">
        <h1>🎵 T3N Voice Bot</h1>
        <div class="status ${botReady ? 'online' : 'offline'}">
            ${botReady ? '🟢 Bot Connected to Discord!' : '🔴 Bot Not Connected'}
        </div>
        <p>Uptime: ${Math.floor(process.uptime())}s</p>
    </div></body></html>
    `);
});

app.get('/health', (req, res) => res.json({
    status: 'ok',
    botReady: botReady,
    uptime: process.uptime()
}));

app.listen(port, '0.0.0.0', () => console.log(`🌐 Server on port ${port}`));

// ===== CONFIGURATION =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const VOICE_CHANNEL_ID = '1396967239948701859';
const WELCOME_SOUND = path.join(__dirname, 'welcome.wav');

console.log("======= T3N VOICE BOT STARTING =======");
console.log("Token set:", !!DISCORD_BOT_TOKEN);
console.log("Token length:", DISCORD_BOT_TOKEN ? DISCORD_BOT_TOKEN.length : 0);
console.log("Sound file exists:", fs.existsSync(WELCOME_SOUND));
console.log("Node version:", process.version);

if (!DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN not set in environment!");
    // Don't exit - keep the server running so user can see status page
}

// ===== DISCORD CLIENT =====
let botReady = false;

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
            // List available voice channels for debugging
            const voiceChannels = client.channels.cache.filter(c => c.type === 2);
            console.log("Available voice channels:", voiceChannels.map(c => `${c.name}(${c.id})`).join(', '));
            return null;
        }

        console.log("Joining voice channel:", channel.name);

        voiceConnection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: true,
        });

        voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                console.log("⚠️ Disconnected. Reconnecting...");
                await entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000);
            } catch {
                console.log("🔄 Full reconnect...");
                voiceConnection.destroy();
                voiceConnection = null;
                setTimeout(joinChannel, 3000);
            }
        });

        voiceConnection.on(VoiceConnectionStatus.Ready, () => {
            console.log("🎙️ Connected to voice channel:", channel.name);
        });

        return voiceConnection;
    } catch (err) {
        console.error("❌ Join error:", err.message);
        return null;
    }
}

// ===== PLAY WELCOME SOUND =====
function playWelcomeSound() {
    if (!voiceConnection || isPlaying) return;

    try {
        const player = createAudioPlayer();
        const resource = createAudioResource(WELCOME_SOUND);

        isPlaying = true;
        player.play(resource);
        voiceConnection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            isPlaying = false;
            console.log("🔇 Sound finished.");
        });

        player.on('error', (err) => {
            console.error("❌ Audio error:", err.message);
            isPlaying = false;
        });

        console.log("🔊 Playing welcome sound!");
    } catch (err) {
        console.error("❌ Play error:", err.message);
        isPlaying = false;
    }
}

// ===== BOT EVENTS =====
client.on('ready', async () => {
    botReady = true;
    console.log(`✅ BOT READY! Logged in as ${client.user.tag}`);
    console.log(`📡 Servers: ${client.guilds.cache.size}`);

    client.user.setPresence({
        activities: [{ name: '🎵 T3N Voice', type: 2 }],
        status: 'online',
    });

    await joinChannel();
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.channelId === VOICE_CHANNEL_ID && oldState.channelId !== VOICE_CHANNEL_ID) {
        if (newState.member.user.bot) return;
        console.log(`👤 ${newState.member.user.tag} joined voice!`);

        if (!voiceConnection) {
            joinChannel().then(() => setTimeout(playWelcomeSound, 500));
        } else {
            playWelcomeSound();
        }
    }
});

client.on('error', (err) => console.error('❌ Client error:', err.message));
client.on('warn', (msg) => console.warn('⚠️ Warning:', msg));

process.on('unhandledRejection', (err) => console.error('❌ Unhandled:', err));
process.on('uncaughtException', (err) => console.error('❌ Exception:', err));

// ===== LOGIN =====
if (DISCORD_BOT_TOKEN) {
    console.log("🔑 Logging in to Discord...");

    const loginTimeout = setTimeout(() => {
        console.error("❌ LOGIN TIMEOUT after 30s! Token is likely invalid/revoked.");
        console.error("Go to Discord Developer Portal -> Reset Token -> Update in Render.");
    }, 30000);

    client.login(DISCORD_BOT_TOKEN)
        .then(() => {
            clearTimeout(loginTimeout);
            console.log("🔑 LOGIN SUCCESS!");
        })
        .catch((err) => {
            clearTimeout(loginTimeout);
            console.error("❌ LOGIN FAILED:", err.message);
            console.error("Go to Discord Developer Portal -> Reset Token -> Update in Render.");
        });
} else {
    console.error("❌ No token! Set DISCORD_BOT_TOKEN in Render Environment.");
}
