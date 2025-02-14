from flask import Flask, render_template, request, jsonify, session
import os
import psycopg2
import bcrypt
import re
from uuid import uuid4

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "default_secret")

DATABASE_URL = os.getenv("DATABASE_URL")
conn = psycopg2.connect(DATABASE_URL, sslmode="require")
cursor = conn.cursor()
cursor.execute("SELECT * FROM users;")
print(cursor.fetchall())  # If this works, DB connection is fine

def get_db():
    """Connect to the PostgreSQL database."""
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def initialize_database():
    """Create users table if it doesn't exist."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        online BOOLEAN DEFAULT FALSE
    );
    """)

    # Create the new 'user_profiles' table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        player_name TEXT DEFAULT NULL,
        user_age INTEGER DEFAULT 25,
        user_balance INTEGER DEFAULT 1000,
        user_location TEXT DEFAULT 'Starting Point',
        user_country TEXT DEFAULT 'United States'
    );
    """)

    conn.commit()
    cursor.close()
    conn.close()

initialize_database()

@app.route("/")
def login_page():
    """ Serve the login page """
    return render_template("index.html")

@app.route("/chat")
def chat_page():
    """ Redirect if user is not logged in """
    if "username" not in session:
        return redirect(url_for("login_page"))
    return render_template("chat.html")

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    # Enforce username length limit
    if len(username) > 15:
        return jsonify({"error": "Username must be 15 characters or less"}), 400
    
    # Password validation rules
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters long"}), 400
    if not re.search(r'[A-Z]', password):
        return jsonify({"error": "Password must contain at least one uppercase letter"}), 400
    if not re.search(r'[!@#$%^&*]', password):
        return jsonify({"error": "Password must contain at least one special character (!@#$%^&*)"}), 400

    # Hash the password
    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING username", 
                       (username, hashed_pw))
        new_user = cursor.fetchone()[0]
        print(f"User {new_user} added to users table.")

        conn.commit()
        session["username"] = new_user  # Store username in session

        return jsonify({"message": f"CITIZEN {new_user} HAS JOINED!", "username": new_user})

    except psycopg2.IntegrityError as e:
        conn.rollback()
        print(f"Integrity Error: {e}")
        return jsonify({"error": "Username already exists"}), 400

    except Exception as e:
        conn.rollback()
        print(f"Error inserting into users: {e}")
        return jsonify({"error": "Database error"}), 500
    
    finally:
        cursor.close()
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")
    player_name = data.get("playerName")  # ADDED

    if not username or not password or not player_name:
        return jsonify({"error": "Username, password, and player name required"}), 400

    # Enforce player_name length limit
    if len(player_name) > 15:
        return jsonify({"error": "Player name must be 15 characters or less"}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, password_hash FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user[1].encode('utf-8')):
        return jsonify({"error": "Invalid credentials"}), 401

    session["user_id"] = user[0]
    session["username"] = username
    session["player_name"] = player_name  # Store Player Name in session

    cursor.execute("UPDATE users SET online = TRUE WHERE id = %s", (user[0],))
    
    # Check if user has a profile; if not, insert default profile
    cursor.execute("SELECT 1 FROM user_profiles WHERE username = %s", (username,))
    profile_exists = cursor.fetchone()

    if not profile_exists:
        cursor.execute("""
            INSERT INTO user_profiles (username, player_name, user_age, user_balance, user_location, user_country)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (username, player_name, 25, 1000, 'Wood Shed', 'United States'))
        print(f"User profile initialized for {username}.")
    else:
        # Update player name on login
        cursor.execute("UPDATE user_profiles SET player_name = %s WHERE username = %s", (player_name, username))

    # Fetch user profile data
    cursor.execute("""
        SELECT player_name, user_age, user_balance, user_location, user_country 
        FROM user_profiles WHERE username = %s
    """, (username,))
    user_data = cursor.fetchone()
    
    conn.commit()
    cursor.close()
    conn.close()

    if user_data:
        return jsonify({
            "message": "Login successful",
            "player_name": user_data[0],
            "age": user_data[1],
            "balance": user_data[2],
            "location": user_data[3],
            "country": user_data[4]
        })
    
    else:
        return jsonify({"error": "User profile not found"}), 404

@app.route('/logout', methods=['POST'])
def logout():
    """Logs out a player by updating their online status and clearing their session."""
    if "user_id" in session:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET online = FALSE WHERE id = %s", (session["user_id"],))
        conn.commit()
        cursor.close()
        conn.close()

    session.clear()  # Remove session data
    return jsonify({"message": "Logout successful"})

@app.route('/active_users', methods=['GET'])
def active_users():
    """Retrieve a list of active users from the database and show logout messages."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
            SELECT user_profiles.player_name, users.username 
            FROM users 
            JOIN user_profiles ON users.username = user_profiles.username 
            WHERE users.online = TRUE
        """)
    users = cursor.fetchall()

    cursor.close()
    conn.close()

    if not users:
        return jsonify([{"username": "None"}])  # Show "None" if no players are online

    return jsonify([{"player_name": user[0], "username": user[1]} for user in users])

@app.route('/get_user_profile', methods=['GET'])
def get_user_profile():
    """Retrieve the logged-in user's profile data."""
    if "username" not in session:
        return jsonify({"error": "No user logged in"}), 401

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT player_name, user_age, user_balance, user_location, user_country
        FROM user_profiles WHERE username = %s
    """, (session["username"],))
    user = cursor.fetchone()

    cursor.close()
    conn.close()

    if user:
        return jsonify({
            "player_name": user[0],
            "age": user[1],
            "balance": user[2],
            "location": user[3],
            "country": user[4]
        })
    else:
        return jsonify({"error": "User not found"}), 404
    
@app.route("/get_user_status", methods=["GET"])
def get_user_status():
    if "user_id" in session:
        return jsonify({"logged_in": True})
    return jsonify({"logged_in": False})

@app.route("/restart", methods=["POST"])
def restart():
    if "user_id" not in session:
        return jsonify({"error": "User not logged in"}), 401

    data = request.json
    password = data.get("password")
    new_player_name = data.get("newPlayerName")

    print(f"🔍 Received restart request: password={password}, newPlayerName={new_player_name}")  # DEBUGGING

    if not password or not new_player_name:
        return jsonify({"error": "Missing password or player name"}), 400

    user_id = session["user_id"]

    try:
        conn = get_db()
        cursor = conn.cursor()

        # ✅ Ensure the user exists before proceeding
        cursor.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found"}), 404

        # ✅ Verify the password
        if not bcrypt.checkpw(password.encode('utf-8'), user[0].encode('utf-8')):
            return jsonify({"error": "Incorrect password"}), 401

        # ✅ Correct SQL query (No duplicate assignments)
        cursor.execute("""
            UPDATE user_profiles 
            SET player_name = %s, user_balance = 0 
            WHERE username = (SELECT username FROM users WHERE id = %s)
        """, (new_player_name, user_id))

        conn.commit()
        cursor.close()
        conn.close()

        print("✅ Stats reset successfully!")  # DEBUGGING
        return jsonify({"message": "Stats reset successfully!"})

    except Exception as e:
        print("❌ Error during restart:", e)  # DEBUGGING
        return jsonify({"error": "An error occurred"}), 500
    
@app.route('/')
def home():
    return render_template("index.html")  # Serve index.html instead of plain text

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
