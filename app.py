from flask import Flask, render_template, request, jsonify, session
import openai
import json
from uuid import uuid4

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)