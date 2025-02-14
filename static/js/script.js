document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ DOM fully loaded - Initializing script.js");

    // **📌 Settings Menu**
    const settingsBtn = document.getElementById("settings-btn");
    const settingsMenu = document.getElementById("settings-menu");

    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener("click", (event) => {
            settingsMenu.classList.toggle("hidden");
            event.stopPropagation();
        });

        document.addEventListener("click", (event) => {
            if (!settingsMenu.contains(event.target) && event.target !== settingsBtn) {
                settingsMenu.classList.add("hidden");
            }
        });
    }

    // **📌 Toggle Between Login & Signup Tabs**
    const loginTab = document.getElementById("tab-login");
    const signupTab = document.getElementById("tab-signup");
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");

    if (loginTab && signupTab && loginForm && signupForm) {
        loginTab.addEventListener("click", () => {
            console.log("🔑 Switching to Login Tab");
            loginForm.classList.remove("hidden");
            signupForm.classList.add("hidden");
            loginTab.classList.add("active");
            signupTab.classList.remove("active");
        });

        signupTab.addEventListener("click", () => {
            console.log("🆕 Switching to Sign-Up Tab");
            signupForm.classList.remove("hidden");
            loginForm.classList.add("hidden");
            signupTab.classList.add("active");
            loginTab.classList.remove("active");
        });
    } else {
        console.error("❌ One or more sign-up elements are missing!");
    }

    // Register New User
    function register() {
        let username = document.getElementById("signup-username").value;
        let password = document.getElementById("signup-password").value;

        // Password validation (matches backend rules)
        if (password.length < 8) {
            alert("❌ Password must be at least 8 characters long.");
            return;
        }
        if (!/[A-Z]/.test(password)) {
            alert("❌ Password must contain at least one uppercase letter.");
            return;
        }
        if (!/[!@#$%^&*]/.test(password)) {
            alert("❌ Password must contain at least one special character (!@#$%^&*).");
            return;
        }

        fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert("❌ " + data.error);
            } else {
                alert("✅ " + data.message);
                // fetchActiveUsers();  // Refresh player activity after registering
            }
        })
        .catch(error => {
            alert("❌ Registration failed. See console for details.");
            console.error(error);
        });
    }

    // Login Existing User
    function login() {
        let username = document.getElementById("login-username").value;
        let password = document.getElementById("login-password").value;
        let playerName = document.getElementById("login-playername").value;  // ADDED
        
        fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, playerName })  // ADDED playerName
        }).then(res => res.json()).then(data => {
            if (data.error) {
                alert("❌ " + data.error);
            } else {
                sessionStorage.setItem("playerName", playerName); // Store the player name in session storage
                alert("✅ Login successful! Welcome, " + data.player_name + "!");                // Update the sticky note with user data
                window.location.href = "/chat";  // Redirect to chat page

            // **Close the login window immediately**
                let authWindow = document.getElementById("auth-window");
                if (authWindow) {
                    authWindow.classList.add("hidden");
                } else {
                    console.error("❌ Login window (auth-window) not found!");
                }
        
                // **Show the settings menu immediately after login**
                checkLoginStatus();
        
                // Hide login prompt after successful login
                document.getElementById("login-prompt").classList.add("hidden");
        
        
                // Hide the Matrix effect
                document.getElementById("matrix-canvas").classList.add("hidden");
        
                // **Show the sticky note after login**
                document.getElementById("stats-container").classList.remove("hidden");
        
                // Update player stats
                updateUserProfile();
            }
        });
    }

    // **📌 Auth Window Toggle**
    const showAuthBtn = document.getElementById("show-auth");
    const authWindow = document.getElementById("auth-window");

    if (showAuthBtn && authWindow) {
        showAuthBtn.addEventListener("click", () => {
            authWindow.classList.toggle("hidden");
        });

        document.addEventListener("click", (event) => {
            if (!authWindow.contains(event.target) && event.target !== showAuthBtn) {
                authWindow.classList.add("hidden");
            }
        });
    }

    // **📌 Toggle Player Activity**
    const showActivityBtn = document.getElementById("show-activity");
    const playerActivity = document.getElementById("player-activity");

    if (showActivityBtn && playerActivity) {
        showActivityBtn.addEventListener("click", (event) => {
            playerActivity.classList.toggle("hidden");
            fetchActiveUsers();
            event.stopPropagation();
        });
    }

    // **📌 Toggle Game Events**
    const showEventsBtn = document.getElementById("show-events");
    const eventLog = document.getElementById("event-log");

    if (showEventsBtn && eventLog) {
        showEventsBtn.addEventListener("click", (event) => {
            eventLog.classList.toggle("hidden");
            event.stopPropagation();
        });
    }

    // **📌 Fetch Active Users**
    function fetchActiveUsers() {
        const list = document.getElementById("activity-list");
        if (!list) return console.error("❌ Element 'activity-list' not found!");

        fetch("/active_users")
        .then(res => res.json())
        .then(users => {
            list.innerHTML = "";

            if (users.length === 1 && users[0].username === "None") {
                let noneMessage = document.createElement("li");
                noneMessage.id = "no-players";
                noneMessage.innerText = "None";
                noneMessage.style.fontStyle = "italic";
                list.appendChild(noneMessage);
            } else {
                let noneMessage = document.getElementById("no-players");
                if (noneMessage) {
                    noneMessage.remove();
                }

                users.forEach((user) => {
                    let li = document.createElement("li");
                    li.innerHTML = `${user.player_name} (<i>${user.username}</i>)`;
                    list.appendChild(li);
                });
            }
        })
        .catch(error => console.error("❌ Error fetching active users:", error));
    }

    // **📌 Enable Text Input**
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

    // **📌 Make Elements Draggable**
    function makeDraggable(element) {
        let offsetX, offsetY, isDragging = false;

        element.addEventListener('mousedown', (event) => {
            isDragging = true;
            offsetX = event.clientX - element.getBoundingClientRect().left;
            offsetY = event.clientY - element.getBoundingClientRect().top;
            element.style.position = "absolute";
            element.style.zIndex = "1000"; // Keep it on top
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

        document.addEventListener("mouseup", () => {
            isDragging = false;
        });
        
        // Change cursor when hovering over draggable elements
        element.style.cursor = "grab";
        
        element.addEventListener("mousedown", () => {
            element.style.cursor = "grabbing";
        });
        
        element.addEventListener("mouseup", () => {
            element.style.cursor = "grab";
        });
    }

    // Set Elements To Be Draggable
    const elementsToDrag = ["stats-container", "player-activity", "auth-window", "event-log"];

    elementsToDrag.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            makeDraggable(element);
        } else {
            console.warn(`⚠️ ${id} not found! Skipping makeDraggable()`);
        }
    });

    setInterval(() => {
        fetch("/get_user_status")
        .then(res => res.json())
        .then(data => {
            if (data.logged_in && typeof updateUserProfile === "function") {
                updateUserProfile();
            }
        });
    }, 5000);

    // **📌 Chat Functionality**
    const chatInput = document.getElementById("chat-input");
    const chatBox = document.getElementById("chat-box");

    function appendMessage(sender, message) {
        if (!chatBox) return;
        let messageDiv = document.createElement("div");
        messageDiv.classList.add(sender === "user" ? "user-message" : "bot-message");
        messageDiv.innerText = message;
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function sendMessage() {
        if (!chatInput || !chatBox) return;

        let message = chatInput.value.trim();
        if (message === "") return;

        appendMessage("user", message);
        chatInput.value = "";

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
            console.error("❌ Error:", error);
            appendMessage("bot", "❌ Error connecting to the server.");
        });
    }

    if (chatInput) {
        chatInput.addEventListener("keypress", function (event) {
            if (event.key === "Enter") {
                sendMessage();
            }
        });
    }

    // **📌 Logout Functionality**
    function logout() {
        fetch("/logout", { method: "POST" })
        .then(res => res.json())
        .then(data => {
            alert(data.message);
            fetchActiveUsers();
            document.getElementById("stats-container").classList.add("hidden");
            checkLoginStatus();
        });
    }

    // **📌 Update User Profile**
    function updateUserProfile() {
        fetch("/get_user_status")
        .then(res => res.json())
        .then(data => {
            if (!data.logged_in) return console.warn("User not logged in.");
            fetch("/get_user_profile")
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    document.getElementById("stats-container").classList.add("hidden");
                } else {
                    document.getElementById("stats-container").classList.remove("hidden");
                    document.getElementById("player-name").innerText = data.player_name || "-";
                    document.getElementById("age").innerText = data.age || "-";
                    document.getElementById("pay").innerText = data.balance ? `$${data.balance}` : "$0";
                    document.getElementById("wealth").innerText = data.balance ? `$${data.balance}` : "$0";
                    document.getElementById("location").innerText = data.location || "-";
                    document.getElementById("country").innerText = data.country || "-";
                }
            })
            .catch(error => console.error("Error fetching user profile:", error));
        })
        .catch(error => console.error("Error checking login status:", error));
    }

    updateUserProfile();
    fetchActiveUsers();
});
