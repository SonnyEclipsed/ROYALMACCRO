document.addEventListener("DOMContentLoaded", function () {
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
});

document.addEventListener("DOMContentLoaded", function () {
    makeDraggable(document.getElementById("stats-container"));
});

document.addEventListener("DOMContentLoaded", function () {
    // Toggle Settings Menu
    document.getElementById("settings-btn").addEventListener("click", (event) => {
        let menu = document.getElementById("settings-menu");
        menu.classList.toggle("hidden");
        event.stopPropagation(); // Prevent immediate closing
    });

    // Close Settings Menu when clicking outside
    document.addEventListener("click", (event) => {
        let menu = document.getElementById("settings-menu");
        let button = document.getElementById("settings-btn");

        if (!menu.contains(event.target) && event.target !== button) {
            menu.classList.add("hidden");
        }
    });

    // Toggle Player Activity Window
    document.getElementById("show-activity").addEventListener("click", (event) => {
        let activityWindow = document.getElementById("player-activity");
        activityWindow.classList.toggle("hidden");
        fetchActiveUsers(); // Refresh user list
        event.stopPropagation();
    });

    // Make the Player Activity Window Draggable
    function makeDraggable(element) {
        let offsetX, offsetY, isDragging = false;

        element.addEventListener("mousedown", (event) => {
            isDragging = true;
            offsetX = event.clientX - element.getBoundingClientRect().left;
            offsetY = event.clientY - element.getBoundingClientRect().top;
            element.style.position = "absolute";
            element.style.zIndex = "1000"; // Keep it above other elements
        });

        document.addEventListener("mousemove", (event) => {
            if (isDragging) {
                element.style.left = (event.clientX - offsetX) + "px";
                element.style.top = (event.clientY - offsetY) + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
        });
    }
});

// Toggle Game Events Window
document.getElementById("show-events").addEventListener("click", (event) => {
    let eventLogWindow = document.getElementById("event-log");
    eventLogWindow.classList.toggle("hidden");
    event.stopPropagation();
});

document.addEventListener("DOMContentLoaded", function () {
    makeDraggable(document.getElementById("player-activity"));
});

// Fetch Active Users
function fetchActiveUsers() {
    fetch("/active_users")
    .then(res => res.json())
    .then(users => {
        let list = document.getElementById("activity-list");
        list.innerHTML = "";

        // If "None" is returned, display it in Player Activity
        if (users.length === 1 && users[0].username === "None") {
            let noneMessage = document.createElement("li");
            noneMessage.id = "no-players";  // Assign ID to remove it later
            noneMessage.innerText = "None";
            noneMessage.style.fontStyle = "italic";
            list.appendChild(noneMessage);
        } else {
            // Remove "None" message if players exist
            let noneMessage = document.getElementById("no-players");
            if (noneMessage) {
                noneMessage.remove();
            }

            users.forEach((user, index) => {
                let li = document.createElement("li");

                // Format as "Player_name (username)"
                li.innerHTML = `${user.player_name} (<i>${user.username}</i>)`;

                list.appendChild(li);
            });
        }
    })
    .catch(error => console.error("Error fetching active users:", error));
}

// Refresh Active Players Every Second
setInterval(() => {
    fetch("/get_user_status")
    .then(res => res.json())
    .then(data => {
        if (data.logged_in) {
            updateUserProfile(); // ✅ Only update profile if logged in
        }
    });
}, 5000); // Runs every 5 seconds

// Run on page load
document.addEventListener("DOMContentLoaded", fetchActiveUsers);

// Handle Player Choices
function submitChoice(choice) {
    fetch('/game', {
        method: 'POST',
        body: JSON.stringify({ action: choice }),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('prompt').innerText = data.response;
    });
}

// Toggle Auth Window
document.getElementById("show-auth").addEventListener("click", () => {
    document.getElementById("auth-window").classList.toggle("hidden");
});

// Toggle Between Login & Signup Tabs
document.getElementById("tab-login").addEventListener("click", () => {
    document.getElementById("login-form").classList.remove("hidden");
    document.getElementById("signup-form").classList.add("hidden");
    document.getElementById("tab-login").classList.add("active");
    document.getElementById("tab-signup").classList.remove("active");
});

document.getElementById("tab-signup").addEventListener("click", () => {
    document.getElementById("signup-form").classList.remove("hidden");
    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("tab-signup").classList.add("active");
    document.getElementById("tab-login").classList.remove("active");
});

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
            fetchActiveUsers();  // Refresh player activity after registering
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

// Logout User
function logout() {
fetch("/logout", { method: "POST" }).then(res => res.json()).then(data => {
    alert(data.message);
    // **Hide the sticky note after logout**
    document.getElementById("stats-container").classList.add("hidden");
    document.getElementById("login-prompt").classList.remove("hidden");
    document.getElementById("matrix-canvas").classList.remove("hidden");
    fetchActiveUsers(); // Refresh Player Activity after logging out
    // **Hide the settings menu immediately after logout**
    checkLoginStatus();
});
}

// Make the Player Activity & User Login Windows Draggable
function makeDraggable(element) {
let offsetX, offsetY, isDragging = false;

element.addEventListener("mousedown", (event) => {
    isDragging = true;
    offsetX = event.clientX - element.getBoundingClientRect().left;
    offsetY = event.clientY - element.getBoundingClientRect().top;
    element.style.position = "absolute";
    element.style.zIndex = "1000"; // Keep it above other elements
});

document.addEventListener("mousemove", (event) => {
    if (isDragging) {
        element.style.left = (event.clientX - offsetX) + "px";
        element.style.top = (event.clientY - offsetY) + "px";
    }
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

// Initialize Draggable Elements After Page Loads
document.addEventListener("DOMContentLoaded", function () {
makeDraggable(document.getElementById("player-activity"));
makeDraggable(document.getElementById("auth-window"));  // Make User Login window draggable
makeDraggable(document.getElementById("event-log"));  // Game Events Window
});

function logout() {
fetch("/logout", { method: "POST" })
.then(res => res.json())
.then(data => {
    alert(data.message);
    fetchActiveUsers(); // Refresh Player Activity after logging out
    // Hide the sticky note after logout
    document.getElementById("stats-container").classList.add("hidden");
    // **Close all open popups and activity windows**
    document.getElementById("player-activity").classList.add("hidden");
    document.getElementById("event-log").classList.add("hidden");
    document.getElementById("restart-popup").classList.add("hidden");

    // **Reset settings menu to only show the login button**
    checkLoginStatus();
});
}

function updateUserProfile() {
fetch("/get_user_status")
.then(res => res.json())
.then(data => {
    if (!data.logged_in) {
        console.warn("User not logged in. Skipping updateUserProfile.");
        return; // ✅ Stop execution if the user is not logged in
    }
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

// Ensure the sticky note is shown if a user is already logged in
document.addEventListener("DOMContentLoaded", function () {
updateUserProfile();
});

// Fetch user profile on page load and update every 10 seconds
document.addEventListener("DOMContentLoaded", function () {
updateUserProfile();
setInterval(updateUserProfile, 1000);
});

// Toggle the Restart Player Window when clicking its tab
document.getElementById("restart-btn").addEventListener("click", () => {
let restartPopup = document.getElementById("restart-popup");
if (restartPopup.classList.contains("hidden")) {
    restartPopup.classList.remove("hidden"); // Show the window
} else {
    restartPopup.classList.add("hidden"); // Hide the window if it's already open
}
});
// Close the popup when cancel is clicked
function closeRestartPopup() {
document.getElementById("restart-popup").classList.add("hidden");
}

// Confirm restart and send data to server
function confirmRestart() {
let password = document.getElementById("restart-password").value;
let newPlayerName = document.getElementById("restart-playername").value;

console.log("Restart button clicked!"); // DEBUGGING LINE

if (!password || !newPlayerName) {
    alert("❌ Please enter your password and new player name.");
    return;
}

console.log("Sending restart request..."); // DEBUGGING LINE

fetch("/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: password, newPlayerName: newPlayerName }) 
})
.then(res => res.json())
.then(data => {
    console.log("Server response:", data); // DEBUGGING LINE

    if (data.error) {
        alert("❌ " + data.error);
    } else {
        alert("✅ Your stats have been reset!");

        // Close restart popup and refresh user data
        document.getElementById("restart-popup").classList.add("hidden");
        updateUserProfile(); // Refresh stats on sticky note
    }
})
.catch(error => console.error("Error during restart:", error));
}

// Function to check if user is logged in and show/hide settings buttons
function checkLoginStatus() {
fetch("/get_user_status")
.then(res => res.json())
.then(data => {
    if (data.logged_in) {
        document.getElementById("settings-buttons").classList.remove("hidden"); // Show all settings
        document.getElementById("show-auth").classList.add("hidden"); // Hide Login button
    } else {
        document.getElementById("settings-buttons").classList.add("hidden"); // Hide settings
        document.getElementById("show-auth").classList.remove("hidden"); // Show Login button
    }
});
}

// Run the function on page load
document.addEventListener("DOMContentLoaded", checkLoginStatus);