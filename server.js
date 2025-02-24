// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the "public" folder.
app.use(express.static('public'));

// Global game state for the interactive Oregon Trail game.
let gameState = {
  occupation: "Pioneer",
  partyNames: ["Alice", "Bob", "Charlie", "Dana"],
  currentDate: { day: 1, month: "April" },
  routeProgress: { miles: 0, landmarks: [] },
  inventory: { oxen: 4, food: 500, clothes: 50, bullets: 100, wagonParts: 3, money: 800 },
  pace: "steady",
  rations: "normal",
  eventFlags: {}
};

// Helper function to roll a six-sided dice.
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

// Create a namespace for our interactive game.
const oregonNamespace = io.of('/oregon');

oregonNamespace.on('connection', (socket) => {
  console.log("Client connected to Oregon namespace:", socket.id);

  // When a client connects, send a welcome narrative and the current game state.
  socket.emit('narrative', "Welcome to the Oregon Trail! Your journey begins now. Enter your command to shape your destiny.");
  emitGameState(socket);

  // Listen for the user's manual command.
  socket.on('chat_message', async (data) => {
    // data: { userId, message }
    console.log(`Received command from ${data.userId}: ${data.message}`);

    try {
      // Compose a system prompt instructing ChatGPT to drive the interactive narrative.
      // The prompt instructs that if a risky decision is proposed, the JSON output should include riskAction and riskOutcome (null).
      const systemPrompt = `
You are an interactive narrative engine for an Oregon Trail game. The game state is represented as JSON with the following keys:
- occupation (string)
- partyNames (array of strings)
- currentDate (object with "day" and "month")
- routeProgress (object with "miles" and "landmarks" (array))
- inventory (object with keys: oxen, food, clothes, bullets, wagonParts, money)
- pace (string)
- rations (string)
- eventFlags (object of miscellaneous flags)

When continuing the story based on the user command: "${data.message}", produce a response in two parts separated by the delimiter "\n===JSON===\n".

The first part is a connected narrative with high stakes and unexpected twists, where characters may face life-and-death decisions (for example, deciding whether to shoot an attacker). If you include a risky decision, add two new keys in the JSON output:
- "riskAction": a string describing the risky action (e.g. "shoot").
- "riskOutcome": set this to null.

The second part must be valid JSON representing the updated game state (including any changes to progress, inventory, or new risk fields). Do not output any text outside these two parts.
      `;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: data.message },
          // Optionally, include the current game state as context.
          { role: 'assistant', content: JSON.stringify(gameState) }
        ],
        temperature: 0.8,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      });

      const fullResponse = response.data.choices[0].message.content;
      console.log("Full ChatGPT response:", fullResponse);

      // Expect the response to be in two parts separated by the delimiter.
      const delimiter = "\n===JSON===\n";
      const parts = fullResponse.split(delimiter);
      if (parts.length < 2) {
        socket.emit('narrative', "Error: Response format incorrect. Full response: " + fullResponse);
        return;
      }
      let narrative = parts[0].trim();
      const jsonPart = parts[1].trim();

      let updatedState;
      try {
        updatedState = JSON.parse(jsonPart);
      } catch (parseError) {
        socket.emit('narrative', "Error parsing JSON: " + parseError.toString());
        return;
      }

      // Check if the JSON includes a risky decision.
      if (updatedState.riskAction) {
        const dice = rollDice();
        let outcome = "";
        // For example, dice 1-3: failure; 4-6: success.
        if (dice <= 3) {
          outcome = "failure";
        } else {
          outcome = "success";
        }
        updatedState.riskOutcome = outcome;
        // Append risk outcome to the narrative.
        narrative += `\n\n[Risk Event]: You chose to ${updatedState.riskAction}. You rolled a ${dice} and the outcome is ${outcome.toUpperCase()}!`;
      }

      // Merge the updated values into the global game state.
      gameState = { ...gameState, ...updatedState };

      // Emit narrative and updated state separately.
      socket.emit('narrative', narrative);
      emitGameState(socket);

    } catch (error) {
      console.error("Error calling ChatGPT API:", error);
      socket.emit('narrative', "Error processing your command.");
    }
  });

  socket.on('disconnect', () => {
    console.log("Client disconnected from Oregon namespace:", socket.id);
  });
});

// Helper function: emits game state in separate parts.
function emitGameState(socket) {
  // Progress: current date, route progress, pace, and rations.
  const progress = {
    currentDate: gameState.currentDate,
    routeProgress: gameState.routeProgress,
    pace: gameState.pace,
    rations: gameState.rations,
  };
  // Inventory: from the inventory object.
  const inventory = gameState.inventory;
  // Emit to client.
  socket.emit('progress_update', progress);
  socket.emit('inventory_update', inventory);
  socket.emit('json_update', gameState);
}

// Basic status route.
app.get('/', (req, res) => {
  res.send('Oregon Trail Interactive Game Prototype Server is running.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
