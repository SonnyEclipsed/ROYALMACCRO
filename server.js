/********************************************************************************
 * Oregon Trail Multiplayer Prototype Server
 * Fully Updated Server Code (approx. 400 lines)
 ********************************************************************************/

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
require('dotenv').config();

// Create Express app and HTTP server.
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the "public" folder.
app.use(express.static('public'));

/********************************************************************************
 * Global Room Storage
 ********************************************************************************/
const rooms = {};

/********************************************************************************
 * Default Game State Function
 * Returns the initial state of the wagon train and party.
 ********************************************************************************/
function defaultGameState() {
  return {
    occupation: "Pioneer",
    partyNames: [], // Will be set later based on player info.
    currentDate: { day: 1, month: "April" },
    routeProgress: { miles: 0, landmarks: [] },
    inventory: { oxen: 4, food: 500, clothes: 50, bullets: 100, wagonParts: 3, money: 800 },
    pace: "steady",
    rations: "normal",
    eventFlags: {},
    gameStarted: false
  };
}

/********************************************************************************
 * Helper Function: rollDice
 * Rolls a six-sided dice and returns a number from 1 to 6.
 ********************************************************************************/
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/********************************************************************************
 * Function: updatePartyNames
 * Updates the room's game state's partyNames array using player information.
 * If fewer than 4 players are present, default NPC names fill the rest.
 ********************************************************************************/
function updatePartyNames(room) {
  const defaultNPCs = ["NPC1", "NPC2", "NPC3", "NPC4"];
  const playerInfos = room.playerInfo || {};
  const playerNames = Object.values(playerInfos).map(info => info.name);
  let partyNames = [];
  if (playerNames.length < 4) {
    partyNames = playerNames.concat(defaultNPCs.slice(0, 4 - playerNames.length));
  } else {
    partyNames = playerNames;
  }
  room.gameState.partyNames = partyNames;
}

/********************************************************************************
 * Function: startDecisionPhase
 * Called by the host to start a decision phase timer.
 * It resets responses, sets the decision phase active, and starts a 60-second timer.
 ********************************************************************************/
function startDecisionPhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  room.responses = {}; // Reset previous responses.
  room.decisionPhaseActive = true;
  
  // Broadcast a generic decision prompt to all players.
  io.of('/oregon').to(roomId).emit('narrative', "Decision phase started. Please submit your responses.");
  
  // Record timer information.
  room.timerStart = Date.now();
  room.timerDuration = 60000; // 60,000 ms = 60 seconds.
  room.timer = setTimeout(() => {
    compileRoomResponses(roomId);
  }, room.timerDuration);
  
  // Tell all clients to start their timer display.
  io.of('/oregon').to(roomId).emit('start_timer', { remaining: 60 });
}

/********************************************************************************
 * Function: compileRoomResponses
 * Aggregates responses when either all players have responded or the timer expires,
 * then calls ChatGPT to generate the narrative update.
 ********************************************************************************/
async function compileRoomResponses(roomId) {
  const room = rooms[roomId];
  if (!room || !room.decisionPhaseActive) return;
  
  // Clear timer if still active.
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  room.decisionPhaseActive = false;
  
  // Determine which players responded.
  const responders = Object.keys(room.responses);
  // Use stored playerIds to determine non-responders.
  const nonResponders = room.playerIds ? room.playerIds.filter(uid => !responders.includes(uid)) : [];
  
  let aggregatedResponse = "";
  const responseCounts = {};
  
  // Count each normalized response.
  for (let uid in room.responses) {
    let resp = room.responses[uid].trim().toLowerCase();
    responseCounts[resp] = (responseCounts[resp] || 0) + 1;
  }
  
  const uniqueResponses = Object.keys(responseCounts);
  
  // If exactly two unique responses have equal counts, resolve tie with a dice roll.
  if (uniqueResponses.length === 2) {
    const counts = Object.values(responseCounts);
    if (counts[0] === counts[1]) {
      const dice = rollDice();
      const chosenResponse = dice <= 3 ? uniqueResponses[0] : uniqueResponses[1];
      aggregatedResponse = `[Conflict resolved]: Decision chosen: "${chosenResponse}" (Dice roll: ${dice}).\n`;
    } else {
      // Otherwise, simply list all responses.
      for (let uid in room.responses) {
        aggregatedResponse += `[${uid}]: ${room.responses[uid]}\n`;
      }
    }
  } else {
    // If more than two unique responses, simply list all responses.
    for (let uid in room.responses) {
      aggregatedResponse += `[${uid}]: ${room.responses[uid]}\n`;
    }
  }
  
  // Append awake/asleep status.
  aggregatedResponse += `\nAwake: ${responders.join(", ") || "None"}.\n`;
  if (nonResponders.length > 0) {
    aggregatedResponse += `Asleep: ${nonResponders.join(", ")}.\n`;
  }
  
  // Build the system prompt for ChatGPT.
  const systemPrompt = `
You are an interactive narrative engine for an Oregon Trail game.
The current game state is:
${JSON.stringify(room.gameState)}
The party consists of: ${JSON.stringify(room.gameState.partyNames)}
The aggregated responses from the players in this decision phase are:
${aggregatedResponse}
Based on these responses, continue the story and update the game state.
Respond in two parts separated by the delimiter "\n===JSON===\n".
The first part is the narrative, and the second part is valid JSON representing the updated game state.
If a risky decision is involved (e.g., "shoot"), include keys "riskAction" (string) and leave "riskOutcome" as null.
Do not refer to any player as "Guest"; always use their chosen names.
All seemingly unrelated actions should be respected and carried out, unless they are impossible given the circumstances.
If an action's success is uncertain, roll a dice to determine the outcome and include the dice result in the narrative.
Ensure the narrative ends with a moral dilemma or an actionable question for the crew.
  `;
  
  // Notify clients that the aggregated response is generating.
  io.of('/oregon').to(roomId).emit('update_timer_display', { text: "Generating Response..." });
  
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      temperature: 0.8,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    
    const fullResponse = response.data.choices[0].message.content;
    console.log("ChatGPT response for room", roomId, ":", fullResponse);
    const delimiter = "\n===JSON===\n";
    const parts = fullResponse.split(delimiter);
    if (parts.length < 2) {
      io.of('/oregon').to(roomId).emit('narrative', "Error: Response format incorrect. " + fullResponse);
      return;
    }
    let narrative = parts[0].trim();
    const jsonPart = parts[1].trim();
    
    let updatedState;
    try {
      updatedState = JSON.parse(jsonPart);
    } catch (err) {
      io.of('/oregon').to(roomId).emit('narrative', "Error parsing JSON: " + err.toString());
      return;
    }
    
    // Do not automatically resolve risk here; riskOutcome remains null.
    room.gameState = { ...room.gameState, ...updatedState };
    
    // If dice rolls were used for conflict resolution, they are already embedded in aggregatedResponse.
    io.of('/oregon').to(roomId).emit('narrative', narrative);
    emitRoomGameState(roomId);
    io.of('/oregon').to(roomId).emit('update_timer_display', { text: "Start Timer" });
  } catch (error) {
    console.error("Error calling ChatGPT API for room", roomId, ":", error);
    io.of('/oregon').to(roomId).emit('narrative', "Error processing decision phase.");
  }
}

/********************************************************************************
 * Timer Pause/Resume Handlers
 ********************************************************************************/
io.of('/oregon').on('connection', (socket) => {
  socket.on('pause_timer', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.leader) {
      socket.emit('narrative', "Only the room leader can pause the timer.");
      return;
    }
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
      const elapsed = Date.now() - room.timerStart;
      room.timerRemaining = room.timerDuration - elapsed; // in ms
      const remainingSeconds = Math.floor(room.timerRemaining / 1000);
      console.log(`Room ${roomId}: Timer paused with ${remainingSeconds} seconds remaining.`);
      io.of('/oregon').to(roomId).emit('pause_timer', { remaining: remainingSeconds });
    }
  });

  socket.on('resume_timer', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.leader) {
      socket.emit('narrative', "Only the room leader can resume the timer.");
      return;
    }
    if (room.timerRemaining > 0) {
      const remainingSeconds = Math.floor(room.timerRemaining / 1000);
      room.timerStart = Date.now();
      room.timerDuration = room.timerRemaining;
      room.timer = setTimeout(() => {
        compileRoomResponses(roomId);
      }, room.timerDuration);
      io.of('/oregon').to(roomId).emit('resume_timer', { remaining: remainingSeconds });
      console.log(`Room ${roomId}: Timer resumed with ${remainingSeconds} seconds remaining.`);
      room.timerRemaining = 0;
    }
  });
});

/********************************************************************************
 * Function: emitRoomGameState
 * Sends the current game state (progress, inventory, JSON, and room info)
 * to all clients in the room.
 ********************************************************************************/
function emitRoomGameState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const state = room.gameState;
  const progress = {
    currentDate: state.currentDate,
    routeProgress: state.routeProgress,
    pace: state.pace,
    rations: state.rations,
  };
  const inventory = state.inventory;
  io.of('/oregon').to(roomId).emit('progress_update', progress);
  io.of('/oregon').to(roomId).emit('inventory_update', inventory);
  io.of('/oregon').to(roomId).emit('json_update', state);
  io.of('/oregon').to(roomId).emit('room_info', { roomId, members: room.players.length });
}

/********************************************************************************
 * Socket Event Handlers for Oregon Trail Namespace
 ********************************************************************************/
io.of('/oregon').on('connection', (socket) => {
  console.log("Socket connected to Oregon namespace:", socket.id);

  // Handler for joining a room.
  socket.on('join_room', (data) => {
    const roomId = data.roomId;
    const chosenName = data.chosenName || data.userId; // Use chosen name if provided.
    const userId = data.userId;
    socket.join(roomId);
    console.log(`Socket ${socket.id} (User: ${userId}, Name: ${chosenName}) joined room ${roomId}`);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        roomId,
        leader: socket.id,
        players: [],
        playerInfo: {},
        playerIds: [],
        gameState: defaultGameState(),
        responses: {},
        decisionPhaseActive: false,
        timer: null,
        timerRemaining: 0
      };
    }
    if (rooms[roomId].players.length >= 8) {
      socket.emit('narrative', "Room " + roomId + " is full.");
      return;
    }
    rooms[roomId].players.push(socket.id);
    rooms[roomId].playerIds.push(userId);
    rooms[roomId].playerInfo[userId] = { name: chosenName, info: data.info || {} };
    updatePartyNames(rooms[roomId]);
    
    if (rooms[roomId].gameState.gameStarted) {
      socket.emit('narrative', `${chosenName} stumbled upon the wagon as a hitchhiker!`);
      emitRoomGameState(roomId);
    } else {
      if (rooms[roomId].leader === socket.id) {
        socket.emit('room_leader', { roomId, members: rooms[roomId].players.length });
      }
      io.of('/oregon').to(roomId).emit('room_info', { roomId, members: rooms[roomId].players.length });
      socket.emit('narrative', `Welcome to room ${roomId}! Your journey is about to begin.`);
      emitRoomGameState(roomId);
    }
  });
  
  // Handler for updating character information.
  socket.on('update_character_info', (data) => {
    const roomId = data.roomId;
    const userId = data.userId;
    const info = data.info;
    const room = rooms[roomId];
    if (!room) return;
    room.playerInfo[userId] = { name: info.name || userId, info };
    updatePartyNames(room);
  });
  
  // Handler for starting a decision phase.
  socket.on('start_decision_phase', async (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.leader) {
      socket.emit('narrative', "Only the room leader can start the decision phase.");
      return;
    }
    startDecisionPhase(roomId);
  });
  
  // Handler for starting the game with an expository narrative.
  socket.on('start_game', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.leader) {
      socket.emit('narrative', "Only the room leader can start the game.");
      return;
    }
    room.gameState.gameStarted = true;
    (async () => {
      const initialPrompt = "The wagon train rolls out in the early morning light. You guide your oxen along the trail as the party—composed of your chosen characters—sets forth with hope, determination, and a sense of impending danger. Introduce your characters and their defined attributes, and set the scene for the perilous journey ahead. Then present your first major challenge, ending with a moral dilemma or an actionable question for the crew.";
      const systemPrompt = `
You are an interactive narrative engine for an Oregon Trail game. The current game state is:
${JSON.stringify(room.gameState)}
The party consists of: ${JSON.stringify(room.gameState.partyNames)}
Based on the initial journey, create an expository narrative that introduces the crew's characters and their attributes, sets the scene for a dangerous journey ahead, and describes the first challenge (for example, a river crossing or an unexpected obstacle). Ensure the narrative ends with a moral dilemma or an actionable question for the crew.
Respond in two parts separated by the delimiter "\n===JSON===\n".
The first part is the narrative; the second part is valid JSON representing the updated game state.
If a risky decision is involved, include "riskAction" (string) and leave "riskOutcome" as null.
Do not refer to any player as "Guest"; always use their chosen names.
      `;
      try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: initialPrompt }
          ],
          temperature: 0.8,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          }
        });
        const fullResponse = response.data.choices[0].message.content;
        console.log("Initial ChatGPT response for room", roomId, ":", fullResponse);
        const delimiter = "\n===JSON===\n";
        const parts = fullResponse.split(delimiter);
        if (parts.length < 2) {
          io.of('/oregon').to(roomId).emit('narrative', "Error: Response format incorrect. " + fullResponse);
          return;
        }
        let narrative = parts[0].trim();
        const jsonPart = parts[1].trim();
        let updatedState;
        try {
          updatedState = JSON.parse(jsonPart);
        } catch (err) {
          io.of('/oregon').to(roomId).emit('narrative', "Error parsing JSON: " + err.toString());
          return;
        }
        room.gameState = { ...room.gameState, ...updatedState };
        io.of('/oregon').to(roomId).emit('narrative', narrative);
        emitRoomGameState(roomId);
      } catch (error) {
        console.error("Error calling ChatGPT API for startGame in room", roomId, ":", error);
        io.of('/oregon').to(roomId).emit('narrative', "Error starting game.");
      }
    })();
  });
  
  // Handler for receiving a player's decision response.
  socket.on('room_response', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];
    if (!room || !room.decisionPhaseActive) return;
    room.responses[data.userId] = data.message;
    console.log(`Room ${roomId}: Received response from ${data.userId}: ${data.message}`);
    
    if (Object.keys(room.responses).length === room.players.length) {
      if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
      }
      compileRoomResponses(roomId);
    }
  });
  
  // Handler for user-to-user chat.
  socket.on('user_chat_message', (data) => {
    console.log(`Room ${data.roomId} chat from ${data.userId}: ${data.message}`);
    io.of('/oregon').to(data.roomId).emit('user_chat_update', { userId: data.userId, message: data.message });
  });
  
  // Handle disconnect.
  socket.on('disconnect', () => {
    console.log("Socket disconnected:", socket.id);
    for (let roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.indexOf(socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        // Optionally update party names.
        updatePartyNames(room);
        if (room.leader === socket.id && room.players.length > 0) {
          room.leader = room.players[0];
          io.of('/oregon').to(roomId).emit('room_leader', { roomId, members: room.players.length });
        }
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.of('/oregon').to(roomId).emit('room_info', { roomId, members: room.players.length });
        }
      }
    }
  });
});

/********************************************************************************
 * Basic Route and Server Listen
 ********************************************************************************/
app.get('/', (req, res) => {
  res.send('Oregon Trail Multiplayer Prototype Server is running.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
