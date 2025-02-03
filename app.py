from flask import Flask, render_template, request, jsonify, session
from datetime import datetime, timedelta
import os
import psycopg2
import bcrypt
from uuid import uuid4

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "default_secret")

DATABASE_URL = "postgresql://postgres:ehWWGfMGAdwhYBUjIhAFzrobcSVtqjtJ@monorail.proxy.rlwy.net:23609/railway"

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
        online BOOLEAN DEFAULT FALSE,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- New column to track user activity
    );
    """)

    conn.commit()
    cursor.close()
    conn.close()

initialize_database()

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING username", 
                       (username, hashed_pw))
        new_user = cursor.fetchone()[0]
        conn.commit()
        session["username"] = new_user  # Store username in session

        return jsonify({"message": f"CITIZEN {new_user} HAS JOINED!", "username": new_user})

    except psycopg2.IntegrityError:
        conn.rollback()
        return jsonify({"error": "Username already exists"}), 400

    finally:
        cursor.close()
        conn.close()

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")
    player_name = data.get("playerName")  # ADDED

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, password_hash FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user[1].encode('utf-8')):
        return jsonify({"error": "Invalid credentials"}), 401

    session["user_id"] = user[0]
    session["username"] = username
    session["player_name"] = player_name  # Store Player Name in session

    cursor.execute("UPDATE users SET online = TRUE, last_active = NOW() WHERE id = %s", (user[0],))
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"message": "Login successful", "username": username, "playerName": player_name})

@app.route('/active_users', methods=['GET'])
def active_users():
    """Retrieve a list of active users from the database and show logout messages."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT username FROM users WHERE online = TRUE")
    users = cursor.fetchall()

    cursor.close()
    conn.close()

    user_list = [{"username": user[0]} for user in users]

    # Announce logouts in the Player Activity
    user_list.insert(0, {"username": "🟢 Welcome to Royal Maccro!"})
    user_list.insert(0, {"username": "🗄️ Using PostgreSQL (Railway)"})  

    return jsonify(user_list)

@app.route('/check_inactivity', methods=['POST'])
def check_inactivity():
    """Logs out users inactive for more than 5 minutes."""
    if "user_id" in session:
        user_id = session["user_id"]

        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT last_active FROM users WHERE id = %s", (user_id,))
        last_active = cursor.fetchone()

        if last_active:
            last_active_time = last_active[0]
            five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)

            if last_active_time < five_minutes_ago:
                # Log out inactive user
                cursor.execute("UPDATE users SET online = FALSE WHERE id = %s", (user_id,))
                conn.commit()
                cursor.close()
                conn.close()

                session.clear()
                return jsonify({"message": "You have been logged out due to inactivity."}), 401

        cursor.close()
        conn.close()

    return jsonify({"message": "User is still active."}), 200

@app.route('/keep_alive', methods=['POST'])
def keep_alive():
    """Updates the user's last_active timestamp to prevent auto-logout."""
    if "user_id" in session:
        user_id = session["user_id"]

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET last_active = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"message": "User activity updated"}), 200
    
    return jsonify({"error": "User not logged in"}), 401


@app.route('/')
def home():
    return render_template("index.html")  # Serve index.html instead of plain text

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
