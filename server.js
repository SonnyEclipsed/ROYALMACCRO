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
    partyNames: [], // Will be set later based on active player info.
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
 * Updates the room's game state's partyNames array using only active player names.
 * Any player with the name "Unnamed" is ignored.
 ********************************************************************************/
function updatePartyNames(room) {
  const playerInfos = room.playerInfo || {};
  const activePlayerNames = Object.values(playerInfos)
    .map(info => info.name)
    .filter(name => name.trim() !== "" && name.toLowerCase() !== "unnamed");
  room.gameState.partyNames = activePlayerNames;
}

/********************************************************************************
 * Function: startDecisionPhase
 * Called by the host to start a decision phase timer.
 ********************************************************************************/
function startDecisionPhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  room.responses = {}; // Reset previous responses.
  room.decisionPhaseActive = true;
  
  io.of('/oregon').to(roomId).emit('narrative', "Decision phase started. Please submit your responses.");
  
  room.timerStart = Date.now();
  room.timerDuration = 60000; // 60 seconds.
  room.timer = setTimeout(() => {
    compileRoomResponses(roomId);
  }, room.timerDuration);
  
  io.of('/oregon').to(roomId).emit('start_timer', { remaining: 60 });
}

/********************************************************************************
 * Function: compileRoomResponses
 * Aggregates responses and calls ChatGPT to generate the narrative update.
 ********************************************************************************/
async function compileRoomResponses(roomId) {
  const room = rooms[roomId];
  if (!room || !room.decisionPhaseActive) return;
  
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  room.decisionPhaseActive = false;
  
  const responders = Object.keys(room.responses);
  const nonResponders = room.playerIds ? room.playerIds.filter(uid => !responders.includes(uid)) : [];
  
  let aggregatedResponse = "";
  const responseCounts = {};
  
  // Build aggregated responses and note which active player said what.
  for (let uid in room.responses) {
    let resp = room.responses[uid].trim().toLowerCase();
    responseCounts[resp] = (responseCounts[resp] || 0) + 1;
  }
  
  const uniqueResponses = Object.keys(responseCounts);
  
  // If exactly two unique responses and they are not mutually exclusive,
  // instruct to execute both actions concurrently.
  if (uniqueResponses.length === 2) {
    // For each response, list active players and their decisions.
    aggregatedResponse = `Active decisions:\n`;
    for (let uid in room.responses) {
      let playerName = room.playerInfo[uid] ? room.playerInfo[uid].name : uid;
      aggregatedResponse += `- ${playerName} (${JSON.stringify(room.playerInfo[uid].info)}) chose: "${room.responses[uid]}"\n`;
    }
    aggregatedResponse += `Both decisions are valid and can be taken concurrently. Roll a dice for each decision to determine its overall effectiveness using the standard outcome scale.\n`;
  } else {
    // If more than two or a single decision, list them normally.
    for (let uid in room.responses) {
      let playerName = room.playerInfo[uid] ? room.playerInfo[uid].name : uid;
      aggregatedResponse += `[${playerName}]: ${room.responses[uid]}\n`;
    }
  }
  
  const awakeNames = responders.map(uid => room.playerInfo[uid] ? room.playerInfo[uid].name : uid);
  const asleepNames = nonResponders.map(uid => room.playerInfo[uid] ? room.playerInfo[uid].name : uid);
  aggregatedResponse += `\nAwake: ${awakeNames.join(", ") || "None"}.\n`;
  if (asleepNames.length > 0) {
    aggregatedResponse += `Asleep: ${asleepNames.join(", ")}.\n`;
  }
  
  // Updated system prompt for decision resolution:
  const systemPrompt = `
You are an interactive narrative engine for an Oregon Trail game.
The current game state is:
${JSON.stringify(room.gameState)}
The party consists of: ${JSON.stringify(room.gameState.partyNames)}
Detailed character attributes (from active players) are available in the player info.
The aggregated responses from the players in this decision phase are:
${aggregatedResponse}

⚔️ **Gameplay Style Guidelines (from Oregon Trail RPG Design ):**
- Your narrative MUST be chock-full of emojis (🎲, 😱, ⚠️, 😎, etc.).
- Include detailed dice roll outcomes using this scale:
   • 1-3: poor roll 😞,
   • 4-5: mediocre roll 😐,
   • 6-7: good roll 😃,
   • 8-10: spectacular roll 🤩.
- The narrative should feel dangerous, creative, and realistic—full of peril and adventure.
- **IMPORTANT:** Only the active players (with proper, non-"Unnamed" names) form the true decision-making team. Address them collectively as the "main characters" and weave in their full character attributes (name, skills, extra info) to make the narrative personal.
- **When conflicting decisions are present:**
    1. List each active player's decision along with their detailed character info.
    2. If both decisions can be taken concurrently (e.g. one player decides to shoot while another decides to hide), narrate both actions separately. For each decision, use a fair dice roll (using a range from 10 to 20 that is evenly divisible by the number of active players) to determine selection if needed—remember, no choice is inherently bad.
    3. Then, for each executed decision, roll another dice (using the standard outcome scale) to determine its overall effectiveness.
    4. Note any logical limitations (e.g., if an invisibility ring is used, explain that it only affects the character and not the supplies or others).
- Structure your response as follows:
   • Paragraphs 1 to n: Analyze and discuss the conflicting decisions with full character details.
   • Paragraphs (n+1) to (n+f): Describe the resolution process, including concurrent execution of both decisions with separate dice rolls for each decision’s effectiveness.
   • Final Paragraph: Continue the narrative and end with an actionable question for the crew.
Respond in two parts separated by the delimiter "\n===JSON===\n".
The first part is the narrative; the second part is valid JSON representing the updated game state.
If a risky decision is involved (e.g., "shoot"), include keys "riskAction" (string) and leave "riskOutcome" as null.
Do not refer to any player as "Guest"; always use their chosen names.
`;
  
  io.of('/oregon').to(roomId).emit('update_timer_display', { text: "Generating Response..." });
  
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [{ role: 'system', content: systemPrompt }],
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
    
    room.gameState = { ...room.gameState, ...updatedState };
    
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
      room.timerRemaining = room.timerDuration - elapsed;
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
 * Sends the current game state to all clients in the room.
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
    const chosenName = data.chosenName || data.userId;
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
    // Initialize player info.
    rooms[roomId].playerInfo[userId] = { 
      name: chosenName, 
      info: data.info || {}, 
      inventory: {} 
    };
    updatePartyNames(rooms[roomId]);
    
    io.of('/oregon').to(roomId).emit('player_stats_update', rooms[roomId].playerInfo);
    
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
    room.playerInfo[userId] = { 
      name: info.name || userId, 
      info, 
      inventory: room.playerInfo[userId] ? room.playerInfo[userId].inventory : {} 
    };
    updatePartyNames(room);
    
    io.of('/oregon').to(roomId).emit('player_stats_update', room.playerInfo);
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
    io.of('/oregon').to(roomId).emit('update_timer_display', { text: "Generating..." });
    (async () => {
      // Build detailed character descriptions from active players.
      let characterDescriptions = "";
      for (const uid in room.playerInfo) {
        const info = room.playerInfo[uid];
        if (info.name.toLowerCase() !== "unnamed") {
          characterDescriptions += `${info.name} (${JSON.stringify(info.info)}), `;
        }
      }
      characterDescriptions = characterDescriptions.replace(/, $/, "");
      
      const initialPrompt = `Welcome to room ${roomId}! Your journey is about to begin.
Your active pioneers, ${characterDescriptions}, are setting out on the Oregon Trail. Their wagon is loaded with essential supplies, and every detail of their character—skills, experience, and personal quirks—will shape their adventure. Introduce the crew personally, highlighting each pioneer’s unique attributes and strengths, and set the stage for the perils and wonders of the journey ahead. Then present your first major challenge, ending with a moral dilemma or actionable question for the entire team.`;
      
      const systemPrompt = `
You are an interactive narrative engine for an Oregon Trail game.
The current game state is:
${JSON.stringify(room.gameState)}
The party consists of: ${JSON.stringify(room.gameState.partyNames)}
Include detailed character attributes (name, skills, extra info) for each active player to create a personal and engaging narrative.
      
⚔️ **Gameplay Style Guidelines (from Oregon Trail RPG Design ):**
- Your narrative MUST be chock-full of emojis (🎲, 😱, ⚠️, 😎, etc.).
- Include detailed dice roll outcomes using this scale:
   • 1-3: poor roll 😞,
   • 4-5: mediocre roll 😐,
   • 6-7: good roll 😃,
   • 8-10: spectacular roll 🤩.
- The narrative should feel dangerous, creative, and realistic—full of peril and adventure.
- **IMPORTANT:** Only the active players (those with proper, non-"Unnamed" names) form the true decision-making team. Address them collectively as the "main characters" and weave in their detailed character attributes to make the story personal.
- Introduce each pioneer with their unique strengths, skills, and background details.
- Then set the scene for the journey and present a major challenge ending with a moral dilemma or actionable question.
Respond in two parts separated by the delimiter "\n===JSON===\n".
The first part is the narrative; the second part is valid JSON representing the updated game state.
If a risky decision is involved, include keys "riskAction" (string) and leave "riskOutcome" as null.
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
        io.of('/oregon').to(roomId).emit('update_timer_display', { text: "Start Timer" });
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