const { Client, GatewayIntentBits } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
} = require('@discordjs/voice');
const path = require('path');
const express = require('express');

// ===== CONFIGURATION =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN not set!");
    process.exit(1);
}

const VOICE_CHANNEL_ID = '1396967239948701859';
const WELCOME_SOUND = path.join(__dirname, 'welcome.wav');

// ===== EXPRESS SERVER (Render health check) =====
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('T3N Voice Bot is running! 🎵'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(port, '0.0.0.0', () => console.log(`🌐 Server on port ${port}`));

// ===== DISCORD CLIENT =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ],
});

let voiceConnection = null;
let isPlaying = false;

// ===== JOIN VOICE CHANNEL =====
async function joinChannel() {
    try {
        const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
        if (!channel) {
            console.error("❌ Voice channel not found! ID:", VOICE_CHANNEL_ID);
            return null;
        }

        voiceConnection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: true,
        });

        // Handle disconnections - auto rejoin
        voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                console.log("⚠️ Disconnected from voice. Reconnecting...");
                await entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5000);
            } catch {
                console.log("🔄 Reconnecting to voice channel...");
                voiceConnection.destroy();
                setTimeout(joinChannel, 3000);
            }
        });

        voiceConnection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`🎙️ Connected to voice channel: ${channel.name}`);
        });

        return voiceConnection;
    } catch (err) {
        console.error("❌ Error joining voice channel:", err.message);
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
        activities: [{ name: '🎵 T3N Voice', type: 2 }], // "Listening to"
        status: 'online',
    });

    // Join the voice channel
    await joinChannel();
});

// ===== VOICE STATE UPDATE (Someone joins/leaves) =====
client.on('voiceStateUpdate', (oldState, newState) => {
    // Someone JOINED the target voice channel
    if (newState.channelId === VOICE_CHANNEL_ID && oldState.channelId !== VOICE_CHANNEL_ID) {
        // Don't play for bots
        if (newState.member.user.bot) return;

        console.log(`👤 ${newState.member.user.tag} joined the voice channel!`);

        // Make sure we're connected
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

// ===== LOGIN =====
client.login(DISCORD_BOT_TOKEN).then(() => {
    console.log("🔑 Login successful!");
}).catch((err) => {
    console.error("❌ LOGIN FAILED:", err.message);
});
