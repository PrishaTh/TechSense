from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend-backend communication

@app.route('/')
def home():
    return "Flask server is running!"

if __name__ == '__main__':
    app.run(debug=True)

#Game Level 1
@app.route('/level1', methods=['POST'])
def level1():
    data = request.json
    user_response = data.get('response', '').lower()  # Get user's input

    if "send code" in user_response     :
        return jsonify({"message": "⚠️ This could be a scam! Never share verification codes.", "safe": False})
    else:
        return jsonify({"message": "✅ Good choice! Always verify requests before sharing info.", "safe": True})
    
#Game Level 2
@app.route('/level2', methods=['POST'])
def level2():
    data = request.json
    user_choice = data.get('choice', '').lower()

    correct_answer = "phishing"  # Example of correct answer

    if user_choice == correct_answer:
        return jsonify({"message": "🎉 Correct! This is a phishing scam.", "correct": True})
    else:
        return jsonify({"message": "❌ Incorrect. Try again!", "correct": False})

