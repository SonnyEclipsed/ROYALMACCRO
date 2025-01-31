from flask import Flask, render_template, request, jsonify, session
import openai
import json
from uuid import uuid4

app = Flask(__name__)
# app.secret_key = 'your_secret_key'

# OPENAI_API_KEY = "YOUR_OPENAI_API_KEY"

# def get_player_id():
#     """Assign a unique ID to each player."""
#     if 'player_id' not in session:
#         session['player_id'] = str(uuid4())
#     return session['player_id']

# def get_global_state():
#     """Fetch or initialize global state."""
#     state = r.get("game_state")
#     if state:
#         return json.loads(state)
#     else:
#         initial_state = {
#             "world_events": [],
#             "player_count": 0
#         }
#         r.set("game_state", json.dumps(initial_state))
#         return initial_state

# def update_global_state(state):
#     """Save global game state."""
#     r.set("game_state", json.dumps(state))

@app.route('/')
def index():
#     """Render main game page."""
#     player_data = {
#         "age": 25,
#         "wealth": 1000,
#         "daily_pay": 20,
#         "location": "City Center",
#         "country": "United States"
#     }
    return render_template('index.html')
    # return render_template('index.html', player=player_data)

# @app.route('/game', methods=['POST'])
# def game():
#     """Process player actions."""
#     player_id = get_player_id()
#     data = request.json

#     global_state = get_global_state()

#     if player_id not in global_state:
#         global_state[player_id] = {
#             "age": 25,
#             "wealth": 1000,
#             "income_rate": 50,
#             "location": "City Center",
#             "story_progress": 0,
#             "inventory": []
#         }

#     player_state = global_state[player_id]
#     player_action = data.get("action", "")

#     # Construct GPT-4 prompt
#     prompt = f"""
#     Player is in {player_state['location']}.
#     They choose to {player_action}.
#     Wealth: ${player_state['wealth']}.
#     Income Rate: ${player_state['income_rate']}/hr.
#     Continue the story.
#     """

#     response = openai.ChatCompletion.create(
#         model="gpt-4",
#         messages=[{"role": "system", "content": "You are a game master."},
#                   {"role": "user", "content": prompt}],
#         max_tokens=200,
#         api_key=OPENAI_API_KEY
#     )

#     gpt_output = response["choices"][0]["message"]["content"].strip()
    
#     player_state["story_progress"] += 1
#     global_state[player_id] = player_state
#     update_global_state(global_state)

#     return jsonify({"response": gpt_output, "state": player_state})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)