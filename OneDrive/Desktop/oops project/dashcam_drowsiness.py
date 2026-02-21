import cv2
import mediapipe as mp
import numpy as np
import threading
import math
import time
import requests
from flask import Flask, render_template, Response, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Allow cross-origin requests from the static HTML dashboard

# ===== CONFIGURATION =====
NODE_API_URL = "http://localhost:5500/drowsiness"

# Global state
cap = None
camera_active = False
current_driver_id = None
last_event_time = 0
COOLDOWN = 3  

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh()

LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
MOUTH = [61, 81, 13, 311, 291, 178, 14, 402]

EAR_THRESHOLD = 0.20
MAR_THRESHOLD = 0.60
FRAME_LIMIT = 20

def calculate_EAR(eye_points):
    p1, p2, p3, p4, p5, p6 = eye_points
    return (np.linalg.norm(p2 - p6) + np.linalg.norm(p3 - p5)) / \
           (2.0 * np.linalg.norm(p1 - p4))

def calculate_MAR(mouth_points):
    p1, p2, p3, p4, p5, p6, p7, p8 = mouth_points
    return np.linalg.norm(p3 - p7) / np.linalg.norm(p1 - p5)

def send_alert_to_backend(score):
    global last_event_time, current_driver_id
    if not current_driver_id: return
    
    current_time = time.time()
    if current_time - last_event_time >= COOLDOWN:
        last_event_time = current_time
        try:
            payload = {"driver_id": current_driver_id, "score": score}
            threading.Thread(target=lambda: requests.post(NODE_API_URL, json=payload, timeout=2)).start()
            print("=> Dashcam Event Sent to Server!")
        except Exception as e:
            print(f"Failed to send alert: {e}")

def generate_frames():
    global cap, camera_active, current_driver_id
    
    eye_counter = 0
    yawn_counter = 0
    drowsiness_score = 0
    
    while camera_active and cap is not None and cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        confidence = 0

        if results.multi_face_landmarks:
            confidence += 40
            for face_landmarks in results.multi_face_landmarks:
                # ===== HEAD TILT =====
                left = face_landmarks.landmark[33]
                right = face_landmarks.landmark[263]
                x1, y1 = int(left.x * w), int(left.y * h)
                x2, y2 = int(right.x * w), int(right.y * h)
                angle = math.degrees(math.atan2((y2 - y1), (x2 - x1)))
                
                cv2.putText(frame, f"Head Tilt: {int(angle)} deg", (20, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,0), 2)
                if abs(angle) > 15: drowsiness_score += 1

                # ===== ATTENTION TRACKING =====
                nose = face_landmarks.landmark[1]
                nose_x = int(nose.x * w)
                if abs(nose_x - w//2) > 100:
                    cv2.putText(frame, "LOOKING AWAY!", (200, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255), 2)
                    drowsiness_score += 1
                else: 
                    confidence += 20

                # ===== EYES =====
                left_eye = [np.array([int(face_landmarks.landmark[idx].x*w), int(face_landmarks.landmark[idx].y*h)]) for idx in LEFT_EYE]
                right_eye = [np.array([int(face_landmarks.landmark[idx].x*w), int(face_landmarks.landmark[idx].y*h)]) for idx in RIGHT_EYE]
                
                EAR = (calculate_EAR(left_eye) + calculate_EAR(right_eye)) / 2
                cv2.putText(frame, f"EAR: {round(EAR,2)}", (20,40), cv2.FONT_HERSHEY_SIMPLEX, 0.8,(0,255,0),2)
                
                if EAR < EAR_THRESHOLD:
                    eye_counter += 1
                    drowsiness_score += 1
                else:
                    eye_counter = 0
                    drowsiness_score -= 0.5
                    confidence += 20

                # ===== MOUTH =====
                mouth_points = [np.array([int(face_landmarks.landmark[idx].x*w), int(face_landmarks.landmark[idx].y*h)]) for idx in MOUTH]
                MAR = calculate_MAR(mouth_points)
                cv2.putText(frame, f"MAR: {round(MAR,2)}", (20,80), cv2.FONT_HERSHEY_SIMPLEX, 0.8,(0,255,0),2)
                
                if MAR > MAR_THRESHOLD:
                    yawn_counter += 1
                    drowsiness_score += 2
                else:
                    yawn_counter = 0
                    confidence += 20

                drowsiness_score = max(0, min(100, drowsiness_score))

                # ===== ALERT =====
                if eye_counter > FRAME_LIMIT or yawn_counter > 15:
                    cv2.putText(frame, "DROWSY ALERT!", (80,250), cv2.FONT_HERSHEY_SIMPLEX, 1.2,(0,0,255),3)
                    send_alert_to_backend(drowsiness_score)

                # ===== SCORE BAR =====
                bar_width = 250
                filled = int((drowsiness_score/100)*bar_width)
                cv2.rectangle(frame,(20,120),(20+bar_width,140), (255,255,255),2)
                cv2.rectangle(frame,(20,120),(20+filled,140), (0,0,255),-1)
                cv2.putText(frame, f"Fatigue Score: {int(drowsiness_score)}%", (20,170), cv2.FONT_HERSHEY_SIMPLEX, 0.7,(255,255,255),2)

                confidence = max(0, min(100, confidence))
                cv2.putText(frame, f"AI Confidence: {confidence}%", (20,300), cv2.FONT_HERSHEY_SIMPLEX, 0.8,(0,255,255),2)
                cv2.putText(frame, f"Monitoring: {current_driver_id}", (w - 250, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7,(255,255,255),2)

        # Encode frame for web streaming
        ret, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/start_camera', methods=['POST'])
def start_camera():
    global cap, camera_active, current_driver_id
    data = request.json
    driver_id = data.get('driver_id')
    
    if not driver_id:
        return jsonify({"success": False, "error": "driver_id is required"}), 400
        
    if camera_active:
        return jsonify({"success": False, "error": "Camera already active"}), 400

    current_driver_id = driver_id
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        return jsonify({"success": False, "error": "Could not open webcam"}), 500

    camera_active = True
    print(f"Flask: Started streaming for {driver_id}")
    return jsonify({"success": True})

@app.route('/stop_camera', methods=['POST'])
def stop_camera():
    global cap, camera_active, current_driver_id
    camera_active = False
    current_driver_id = None
    if cap is not None:
        cap.release()
        cap = None
    print("Flask: Stopped streaming")
    return jsonify({"success": True})

@app.route('/video_feed')
def video_feed():
    if not camera_active:
        # Return a blank image or an error if accessed while shut off
        return "Camera is off", 404
        
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("Starting Flask AI Dashcam Server on port 5001...")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
