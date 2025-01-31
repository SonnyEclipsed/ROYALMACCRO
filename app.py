from flask import Flask, render_template, request, jsonify, session
import openai
import psycopg2
import json
from uuid import uuid4
import os

app = Flask(__name__)
app.secret_key = 'your_secret_key'

# Use Railway's PostgreSQL database
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db():
    """Connect to PostgreSQL database."""
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def initialize_database():
    """Create required tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS game_state (
        id SERIAL PRIMARY KEY,
        state JSONB
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        data JSONB
    );
    """)

    conn.commit()
    cursor.close()
    conn.close()

initialize_database()  # Run this when the app starts

def get_global_state():
    """Fetch global state from PostgreSQL."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT state FROM game_state WHERE id = 1")
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row:
        return row[0]  # JSON data
    else:
        initial_state = {"world_events": [], "player_count": 0}
        update_global_state(initial_state)
        return initial_state

def update_global_state(state):
    """Save global game state to PostgreSQL."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO game_state (id, state) 
    VALUES (1, %s) 
    ON CONFLICT (id) 
    DO UPDATE SET state = EXCLUDED.state
    """, (json.dumps(state),))
    conn.commit()
    cursor.close()
    conn.close()

def get_player_id():
    """Assign a unique ID to each player."""
    if 'player_id' not in session:
        session['player_id'] = str(uuid4())
    return session['player_id']

def get_player_state(player_id):
    """Fetch player state from PostgreSQL."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT data FROM players WHERE player_id = %s", (player_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row:
        return row[0]  # JSON data
    else:
        new_state = {
            "age": 25,
            "wealth": 1000,
            "income_rate": 50,
            "location": "City Center",
            "story_progress": 0,
            "inventory": []
        }
        update_player_state(player_id, new_state)
        return new_state

def update_player_state(player_id, state):
    """Save player state to PostgreSQL."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO players (player_id, data) 
    VALUES (%s, %s) 
    ON CONFLICT (player_id) 
    DO UPDATE SET data = EXCLUDED.data
    """, (player_id, json.dumps(state)))
    conn.commit()
    cursor.close()
    conn.close()

@app.route('/')
def index():
    """Render main game page."""
    player_id = get_player_id()
    player_data = get_player_state(player_id)
    return render_template('index.html', player=player_data)

@app.route('/game', methods=['POST'])
def game():
    """Process player actions."""
    player_id = get_player_id()
    data = request.json

    global_state = get_global_state()
    player_state = get_player_state(player_id)

    player_action = data.get("action", "")

    # Construct GPT-4 prompt
    prompt = f"""
    Player is in {player_state['location']}.
    They choose to {player_action}.
    Wealth: ${player_state['wealth']}.
    Income Rate: ${player_state['income_rate']}/hr.
    Continue the story.
    """

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "system", "content": "You are a game master."},
                  {"role": "user", "content": prompt}],
        max_tokens=200,
        api_key=os.getenv("OPENAI_API_KEY")
    )

    gpt_output = response["choices"][0]["message"]["content"].strip()
    
    player_state["story_progress"] += 1
    update_player_state(player_id, player_state)

    return jsonify({"response": gpt_output, "state": player_state})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))  # Use Railway's assigned port
    app.run(debug=True, host='0.0.0.0', port=port)
