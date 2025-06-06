// server.js - For Hostinger VPS

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS settings to allow all connections
const io = socketIo(server, {
    cors: {
        origin: "*", // Allows connections from any domain
        methods: ["GET", "POST"]
    }
});

// The port your game will run on. 3000 is a common choice.
const PORT = 3000;

// This line tells Express to serve all static files (like your index.html and images)
// from the same directory where this server.js file is located.
app.use(express.static(__dirname));

// --- Game Constants ---
const WORLD_WIDTH = 1200 * 4;
const WORLD_HEIGHT = 900 * 4;
const PLAYER_MAX_HEALTH = 100;
const ATTACK_RANGE = 150; // How far a bat swing reaches
const ATTACK_DAMAGE = 20;

let players = {};

// --- Main Game Logic ---

io.on('connection', (socket) => {
    console.log(`✅ Player connected: ${socket.id}`);

    // Create a new player object when they connect
    players[socket.id] = {
        id: socket.id,
        x: Math.floor(Math.random() * (WORLD_WIDTH - 200)) + 100,
        y: Math.floor(Math.random() * (WORLD_HEIGHT - 200)) + 100,
        health: PLAYER_MAX_HEALTH,
        maxHealth: PLAYER_MAX_HEALTH,
        direction: 1, // 1 for left, -1 for right
        weaponAngle: 0,
        kills: 0,
        name: 'BONKER' // Default name
    };

    // When a player sets their username
    socket.on('setUsername', (username) => {
        const player = players[socket.id];
        if (player) {
            player.name = username.substring(0, 15); // Limit username length
            console.log(`Player ${socket.id} is now known as ${player.name}`);

            // Send the complete game state to the newly joined player
            socket.emit('gameState', {
                players: players,
                playerCount: Object.keys(players).length
            });

            // Inform all other players about the new player
            socket.broadcast.emit('playerUpdate', player);
            // Update the player count for everyone
            io.emit('playerCountUpdate', Object.keys(players).length);
        }
    });

    // When a player moves
    socket.on('move', (data) => {
        const player = players[socket.id];
        if (player) {
            player.x = data.x;
            player.y = data.y;
            player.direction = data.direction;
            player.weaponAngle = data.weaponAngle;
            // Broadcast the movement to all other players
            socket.broadcast.emit('playerUpdate', player);
        }
    });

    // When a player attacks
    socket.on('areaAttack', (data) => handleAttack(socket.id, data.direction));
    socket.on('mobileCollisionAttack', (data) => handleAttack(socket.id, data.direction));
    socket.on('attackAnimation', (data) => socket.broadcast.emit('attackAnimation', data));

    // When a player requests to respawn
    socket.on('respawn', () => {
        const player = players[socket.id];
        if (player && player.health <= 0) {
            player.health = PLAYER_MAX_HEALTH;
            player.x = Math.floor(Math.random() * (WORLD_WIDTH - 200)) + 100;
            player.y = Math.floor(Math.random() * (WORLD_HEIGHT - 200)) + 100;
            // Inform everyone that the player has respawned
            io.emit('playerRespawned', player);
        }
    });

    // When a player disconnects
    socket.on('disconnect', () => {
        console.log(`❌ Player disconnected: ${socket.id}`);
        delete players[socket.id];
        // Inform other players that this player has left
        io.emit('playerLeft', socket.id);
        io.emit('playerCountUpdate', Object.keys(players).length);
    });
});

// Function to handle attack logic
function handleAttack(attackerId, direction) {
    const attacker = players[attackerId];
    if (!attacker || attacker.health <= 0) return;

    for (const victimId in players) {
        if (victimId === attackerId) continue; // Can't hit yourself
        const victim = players[victimId];
        if (!victim || victim.health <= 0) continue;

        const dx = victim.x - attacker.x;
        const dy = victim.y - attacker.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if victim is in attack range
        if (distance < ATTACK_RANGE) {
            // Check if attacker is facing the victim
            const isFacingVictim = (direction === -1 && dx > 0) || (direction === 1 && dx < 0);
            if (isFacingVictim) {
                victim.health -= ATTACK_DAMAGE;
                // Inform everyone about the hit
                io.emit('playerHit', {
                    playerId: victimId,
                    health: victim.health,
                    x: victim.x,
                    y: victim.y
                });

                // Check for a kill
                if (victim.health <= 0) {
                    attacker.kills++;
                    io.emit('playerKilled', {
                        killer: { id: attackerId, name: attacker.name, kills: attacker.kills },
                        victim: { id: victimId, name: victim.name }
                    });
                    // Send an update for the attacker to update their kill count
                    io.emit('playerUpdate', attacker);
                }
                break; // Stop after hitting one player
            }
        }
    }
}

// Start the server and listen on the specified port
server.listen(PORT, () => {
    console.log(`🚀 Bonkers game server is live and running on port ${PORT}`);
});
