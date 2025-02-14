function enableTextInput() {
    document.getElementById('custom-input').style.display = 'block';
    document.getElementById('custom-text').focus();
}

function submitCustomInput() {
    let textInput = document.getElementById('custom-text').value;
    fetch('/game', {
        method: 'POST',
        body: JSON.stringify({ action: textInput }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('prompt').innerText = data.response;
        document.getElementById('custom-input').style.display = 'none';
    });
}

// Make the sticky note draggable
function makeDraggable(element) {
    let offsetX, offsetY, isDragging = false;

    element.addEventListener('mousedown', (event) => {
        isDragging = true;
        offsetX = event.clientX - element.getBoundingClientRect().left;
        offsetY = event.clientY - element.getBoundingClientRect().top;
        element.style.position = "absolute";
    });

    document.addEventListener('mousemove', (event) => {
        if (isDragging) {
            element.style.left = (event.clientX - offsetX) + 'px';
            element.style.top = (event.clientY - offsetY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

document.addEventListener("DOMContentLoaded", function () {
    makeDraggable(document.getElementById("stats-container"));
});

document.addEventListener("DOMContentLoaded", function () {
    const canvas = document.getElementById("matrix-canvas");
    const ctx = canvas.getContext("2d");

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const columns = Math.floor(canvas.width / 14);
    const drops = Array(columns).fill(0);

    function drawMatrix() {
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)"; // Keeps the fade effect smooth
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        ctx.fillStyle = "rgba(0, 255, 0, 0.1)"; // Decreased opacity for letters
        ctx.font = "14px Courier New";
    
        for (let i = 0; i < drops.length; i++) {
            const char = characters[Math.floor(Math.random() * characters.length)];
            const x = i * 14;
            const y = drops[i] * 14;
    
            ctx.fillText(char, x, y);
            
            if (y > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
    
            drops[i]++;
        }
    }

    let matrixInterval = setInterval(drawMatrix, 50);

    // Game Description (Text Falls Into Place)
    const gameDescription = `
🟩 WELCOME TO THE NEW WORLD ORDER 🟩

YEAR: 2025. The world is on the brink. Economies collapse. Cities fall. War looms on every horizon. But the future is still unwritten.

You and your roommates—recent college grads—are thrown into the chaos of World War 3. Some will rise. Some will fall. Some will betray. But perhaps… some will build something new.

🏛 WORK TOGETHER… OR TEAR EACH OTHER APART. Forge alliances, barter for resources, or sabotage your so-called friends. Trust is fragile, but survival demands cooperation.
⚖️ EVERY DECISION CHANGES YOUR FUTURE. Will you lie, steal, and kill your way to power? Or carve a different path in the ashes of the old world?
🎲 THE DICE DECIDE YOUR DESTINY. A single roll can determine whether you live, die, or become something much worse.
🌍 FACTIONS WAGE WAR IN SECRET AND IN THE OPEN. Superpowers vie for control, and not every enemy wears a uniform. Some wars are won in the shadows. Some leaders are never seen.
🕵️ PLAY ALONE OR IN TEAMS. Queue into a shared event where your storylines collide. Will you negotiate, deceive, or fight for something greater?
🌱 HOPE STILL LIVES. A better world is possible—but it won’t come without sacrifice.

You are one person in a world spiraling into chaos. But one person can change everything.

🟩 ENTER THE GAME. CHOOSE YOUR FUTURE. 🟩
    `;

    const textContainer = document.getElementById("text-container");
    textContainer.innerHTML = ""; // Clear container

    // Function to reveal text with falling effect
    function revealText() {
        textContainer.classList.remove("hidden");
        let finalText = gameDescription.trim().split("");
        let displayText = Array(finalText.length).fill(" "); // Empty spaces

        let index = 0;
        let revealInterval = setInterval(() => {
            if (index < finalText.length) {
                displayText[index] = finalText[index]; // Letter falls into place
                textContainer.innerHTML = displayText.join("").replace(/\n/g, "<br>"); // Preserve line breaks
                textContainer.scrollTop = textContainer.scrollHeight; // Auto-scroll to bottom
                index++;
            } else {
                clearInterval(revealInterval);
                
                // After text fully appears, hide Matrix effect
                setTimeout(() => {
                    document.getElementById("matrix-canvas").classList.add("hidden");
                    document.getElementById("login-prompt").classList.remove("hidden"); // Show blinking cursor
                }, 1000);
            }
        }, 30); // Speed of falling letters
    }

    // Start revealing text after 4 seconds of Matrix effect
    setTimeout(() => {
        clearInterval(matrixInterval); // Stop Matrix rain
        revealText();
    }, 4000);


        const chatBox = document.getElementById("chat-box");
    const chatInput = document.getElementById("chat-input");

    function appendMessage(sender, message) {
        let messageDiv = document.createElement("div");
        messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");
        messageDiv.innerText = message;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to the bottom
    }

    function sendMessage() {
        let message = chatInput.value.trim();
        if (message === "") return;

        appendMessage("user", message);
        chatInput.value = ""; // Clear input box

        // Send to Flask backend
        fetch("/chat", {
            method: "POST",
            body: JSON.stringify({ message: message }),
            headers: { "Content-Type": "application/json" }
        })
        .then(response => response.json())
        .then(data => {
            appendMessage("bot", data.response);
        })
        .catch(error => {
            console.error("Error:", error);
            appendMessage("bot", "❌ Error connecting to the server.");
        });
    }

    // Handle Enter key press
    chatInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const chatBox = document.getElementById("chat-box");
    const chatInput = document.getElementById("chat-input");

    function appendMessage(sender, message) {
        let messageDiv = document.createElement("div");
        messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");
        messageDiv.innerText = message;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to the bottom
    }

    function sendMessage() {
        let message = chatInput.value.trim();
        if (message === "") return;

        appendMessage("user", message);
        chatInput.value = ""; // Clear input box

        // Send to Flask backend
        fetch("/chat", {
            method: "POST",
            body: JSON.stringify({ message: message }),
            headers: { "Content-Type": "application/json" }
        })
        .then(response => response.json())
        .then(data => {
            appendMessage("bot", data.response);
        })
        .catch(error => {
            console.error("Error:", error);
            appendMessage("bot", "❌ Error connecting to the server.");
        });
    }

    // Handle Enter key press
    chatInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });
});
