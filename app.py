from flask import Flask, render_template, request, jsonify, session
import os
import psycopg2
import bcrypt
import re
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
        online BOOLEAN DEFAULT FALSE
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

    cursor.execute("UPDATE users SET online = TRUE WHERE id = %s", (user[0],))
    conn.commit()

    cursor.close()
    conn.close()

    return jsonify({"message": "Login successful", "username": username, "playerName": player_name})

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

    cursor.execute("SELECT username FROM users WHERE online = TRUE")
    users = cursor.fetchall()

    cursor.close()
    conn.close()

    if not users:
        return jsonify([{"username": "None"}])  # Show "None" if no players are online

    user_list = [{"username": user[0]} for user in users] 

    return jsonify(user_list)

@app.route('/')
def home():
    return render_template("index.html")  # Serve index.html instead of plain text

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
