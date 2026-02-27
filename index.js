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

// ===== CONFIGURATION =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
console.log("🔍 DEBUG: Token exists:", !!DISCORD_BOT_TOKEN);
console.log("🔍 DEBUG: Token length:", DISCORD_BOT_TOKEN ? DISCORD_BOT_TOKEN.length : 0);
console.log("🔍 DEBUG: Token starts with:", DISCORD_BOT_TOKEN ? DISCORD_BOT_TOKEN.substring(0, 10) + "..." : "N/A");

if (!DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN not set!");
    process.exit(1);
}

const VOICE_CHANNEL_ID = '1396967239948701859';
const WELCOME_SOUND = path.join(__dirname, 'welcome.wav');

// Check if audio file exists
console.log("🔍 DEBUG: Welcome sound exists:", fs.existsSync(WELCOME_SOUND));

// ===== EXPRESS SERVER (Render health check) =====
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('T3N Voice Bot is running! 🎵'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(port, '0.0.0.0', () => console.log(`🌐 Server on port ${port}`));

// ===== DISCORD CLIENT =====
console.log("🔍 DEBUG: Creating Discord client...");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ],
});
console.log("🔍 DEBUG: Discord client created.");

let voiceConnection = null;
let isPlaying = false;

// ===== JOIN VOICE CHANNEL =====
async function joinChannel() {
    try {
        console.log("🔍 DEBUG: Attempting to join voice channel:", VOICE_CHANNEL_ID);
        const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
        if (!channel) {
            console.error("❌ Voice channel not found! ID:", VOICE_CHANNEL_ID);
            console.log("🔍 DEBUG: Available channels:", client.channels.cache.map(c => `${c.name}(${c.id})`).join(', '));
            return null;
        }

        console.log("🔍 DEBUG: Found channel:", channel.name, "| Type:", channel.type);

        voiceConnection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: true,
        });

        voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                console.log("⚠️ Disconnected from voice. Reconnecting...");
                await entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000);
            } catch {
                console.log("🔄 Reconnecting to voice channel...");
                voiceConnection.destroy();
                voiceConnection = null;
                setTimeout(joinChannel, 3000);
            }
        });

        voiceConnection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`🎙️ Connected to voice channel: ${channel.name}`);
        });

        console.log("✅ Voice connection created.");
        return voiceConnection;
    } catch (err) {
        console.error("❌ Error joining voice channel:", err.message);
        console.error(err.stack);
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
            console.log("🔇 Welcome sound finished.");
        });

        player.on('error', (err) => {
            console.error("❌ Audio player error:", err.message);
            isPlaying = false;
        });

        console.log("🔊 Playing welcome sound!");
    } catch (err) {
        console.error("❌ Error playing sound:", err.message);
        isPlaying = false;
    }
}

// ===== BOT READY =====
client.on('ready', async () => {
    console.log(`✅ Voice Bot Ready! Logged in as ${client.user.tag}`);
    console.log(`📡 Serving ${client.guilds.cache.size} servers`);

    client.user.setPresence({
        activities: [{ name: '🎵 T3N Voice', type: 2 }],
        status: 'online',
    });

    await joinChannel();
});

// ===== VOICE STATE UPDATE =====
client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.channelId === VOICE_CHANNEL_ID && oldState.channelId !== VOICE_CHANNEL_ID) {
        if (newState.member.user.bot) return;
        console.log(`👤 ${newState.member.user.tag} joined the voice channel!`);

        if (!voiceConnection) {
            joinChannel().then(() => {
                setTimeout(playWelcomeSound, 500);
            });
        } else {
            playWelcomeSound();
        }
    }
});

// ===== ERROR HANDLING =====
client.on('error', (error) => {
    console.error('❌ Discord Error:', error.message);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ===== LOGIN WITH TIMEOUT =====
console.log("🔑 Attempting Discord login...");

// Set a timeout - if login takes more than 30 seconds, something is wrong
const loginTimeout = setTimeout(() => {
    console.error("❌ LOGIN TIMEOUT: Login took longer than 30 seconds!");
    console.error("This usually means the token is invalid or Discord is blocking the connection.");
}, 30000);

client.login(DISCORD_BOT_TOKEN).then(() => {
    clearTimeout(loginTimeout);
    console.log("🔑 Login successful!");
}).catch((err) => {
    clearTimeout(loginTimeout);
    console.error("❌ LOGIN FAILED:", err.message);
    console.error("Full error:", err);
});
