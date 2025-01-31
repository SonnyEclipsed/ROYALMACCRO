from flask import Flask, render_template, request, jsonify, session
import openai
import json
import os
import psycopg2
import bcrypt
import sqlite3
from uuid import uuid4

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "default_secret")

# Connect to Railway's PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")  # Use SQLite locally if no PostgreSQL URL

def get_db():
    """Connect to the appropriate database (PostgreSQL on Railway, SQLite locally)."""
    if DATABASE_URL.startswith("postgres://"):
        return psycopg2.connect(DATABASE_URL, sslmode="require")
    else:
        return sqlite3.connect("local.db")  # Use SQLite locally

def initialize_database():
    conn = get_db()
    cursor = conn.cursor()

    if DATABASE_URL.startswith("postgres://"):
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            joined_at TIMESTAMP DEFAULT NOW()
        );
        """)
    else:  # If using SQLite locally
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP
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

        # Return the username to display in Player Activity
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

# Get Active Users
@app.route('/active_users', methods=['GET'])
def active_users():
    """Retrieve a list of active users from the database and show database type for the first player."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT username FROM users")
    users = cursor.fetchall()
    
    cursor.close()
    conn.close()

    user_list = [{"username": user[0]} for user in users]
    
    # Add a message showing the database type for the first player
    if len(user_list) > 0:
        database_type = "PostgreSQL (Railway)" if DATABASE_URL.startswith("postgres://") else "SQLite (Local)"
        user_list.insert(0, {"username": "🟢 Welcome to Royal Maccro!"})
        user_list.insert(0, {"username": f"🗄️ Using {database_type}"})  # First message in list

    return jsonify(user_list)

@app.route('/')
def home():
    return render_template("index.html")  # Serve index.html instead of plain text

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)