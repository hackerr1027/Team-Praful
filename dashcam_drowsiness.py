"""
AI Dashcam Drowsiness Server — Flask + OpenCV Haar Cascades
Streams webcam with face tilt, EAR & yawn detection to the Safety Officer dashboard.
Sends drowsiness events to Node.js server for alert creation.
"""

import cv2
import numpy as np
import math
import time
import threading
import requests
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── CONFIG ───
NODE_API_URL = "http://localhost:5500/api/drowsiness"

# ─── Haar Cascades (built into OpenCV) ───
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade  = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
mouth_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_smile.xml')

# ─── Thresholds ───
EYE_CLOSED_FRAMES = 15
YAWN_OPEN_RATIO   = 0.45
HEAD_TILT_ANGLE   = 15

# ─── Global State ───
cap = None
camera_active = False
current_driver_id = None
last_event_time = 0
COOLDOWN = 3  # seconds between alert sends


def send_alert_to_backend(score):
    """Send a drowsiness event to the Node.js server"""
    global last_event_time, current_driver_id
    if not current_driver_id:
        return
    now = time.time()
    if now - last_event_time >= COOLDOWN:
        last_event_time = now
        try:
            payload = {"driver_id": current_driver_id, "score": score}
            threading.Thread(
                target=lambda: requests.post(NODE_API_URL, json=payload, timeout=2),
                daemon=True
            ).start()
            print(f"  => Alert sent to Node.js! (driver: {current_driver_id}, score: {score})")
        except Exception as e:
            print(f"  => Alert send failed: {e}")


def generate_frames():
    """Generate processed video frames with drowsiness detection overlay"""
    global cap, camera_active

    eye_closed_counter = 0
    yawn_counter = 0
    drowsiness_score = 0

    while camera_active and cap is not None and cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # ═══ FACE DETECTION ═══
        faces = face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(120, 120))

        if len(faces) == 0:
            cv2.putText(frame, "NO FACE DETECTED", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            drowsiness_score = max(0, drowsiness_score - 0.5)
        else:
            for (fx, fy, fw, fh) in faces:
                cv2.rectangle(frame, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), 2)
                face_roi_gray = gray[fy:fy + fh, fx:fx + fw]
                face_roi_color = frame[fy:fy + fh, fx:fx + fw]

                # ═══ HEAD TILT ═══
                angle = math.degrees(math.atan2(fh - fw, fw + fh)) * 2
                tilt_color = (0, 255, 0)
                if abs(angle) > HEAD_TILT_ANGLE:
                    tilt_color = (0, 0, 255)
                    drowsiness_score += 0.3
                    cv2.putText(frame, "HEAD TILTED!", (fx, fy - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                cv2.putText(frame, f"Tilt: {int(angle)} deg", (20, h - 120),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, tilt_color, 2)

                # ═══ EYE DETECTION ═══
                upper_face = face_roi_gray[0:fh // 2, :]
                eyes = eye_cascade.detectMultiScale(upper_face, 1.1, 3, minSize=(25, 25))

                if len(eyes) >= 2:
                    eye_closed_counter = 0
                    drowsiness_score = max(0, drowsiness_score - 0.5)
                    ear_text = f"Eyes: OPEN ({len(eyes)})"
                    ear_color = (0, 255, 0)
                    for (ex, ey, ew, eh) in eyes[:2]:
                        cv2.rectangle(face_roi_color, (ex, ey), (ex + ew, ey + eh), (255, 255, 0), 2)
                elif len(eyes) == 1:
                    eye_closed_counter += 1
                    ear_text = "Eyes: PARTIAL (1)"
                    ear_color = (0, 255, 255)
                else:
                    eye_closed_counter += 1
                    drowsiness_score += 0.5
                    ear_text = f"Eyes: CLOSED ({eye_closed_counter})"
                    ear_color = (0, 0, 255)

                cv2.putText(frame, ear_text, (20, h - 80),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, ear_color, 2)

                if eye_closed_counter > EYE_CLOSED_FRAMES:
                    cv2.putText(frame, "DROWSY - EYES CLOSED!", (w // 2 - 180, 60),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)
                    drowsiness_score += 2
                    send_alert_to_backend(drowsiness_score)

                # ═══ YAWN DETECTION ═══
                lower_face = face_roi_gray[fh // 2:, :]
                mouths = mouth_cascade.detectMultiScale(lower_face, 1.7, 11, minSize=(40, 20))

                yawn_detected = False
                if len(mouths) > 0:
                    mx, my, mw, mh = max(mouths, key=lambda m: m[2] * m[3])
                    mouth_ratio = mh / fh
                    if mouth_ratio > YAWN_OPEN_RATIO:
                        yawn_detected = True
                        yawn_counter += 1
                        drowsiness_score += 1.5
                        cv2.rectangle(face_roi_color,
                                      (mx, fh // 2 + my), (mx + mw, fh // 2 + my + mh),
                                      (0, 0, 255), 2)
                        send_alert_to_backend(drowsiness_score)
                    else:
                        yawn_counter = max(0, yawn_counter - 1)
                        cv2.rectangle(face_roi_color,
                                      (mx, fh // 2 + my), (mx + mw, fh // 2 + my + mh),
                                      (0, 255, 0), 1)

                yawn_color = (0, 0, 255) if yawn_detected else (0, 255, 0)
                cv2.putText(frame, f"Mouth: {'YAWNING!' if yawn_detected else 'Normal'}", (20, h - 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, yawn_color, 2)

                if yawn_counter > 10:
                    cv2.putText(frame, "YAWNING - FATIGUE!", (w // 2 - 150, 100),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)

        # ═══ DROWSINESS SCORE BAR ═══
        drowsiness_score = max(0, min(100, drowsiness_score))
        bar_x, bar_y, bar_w, bar_h = 20, 20, 300, 25
        filled = int((drowsiness_score / 100) * bar_w)

        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (60, 60, 60), -1)
        if drowsiness_score < 40:
            bar_color = (0, 200, 0)
        elif drowsiness_score < 70:
            bar_color = (0, 200, 255)
        else:
            bar_color = (0, 0, 255)
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + filled, bar_y + bar_h), bar_color, -1)
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (200, 200, 200), 2)
        cv2.putText(frame, f"Fatigue: {int(drowsiness_score)}%", (bar_x + bar_w + 10, bar_y + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        # ═══ DRIVER LABEL ═══
        cv2.putText(frame, f"Driver: {current_driver_id[:12]}..." if current_driver_id and len(current_driver_id) > 12 else f"Driver: {current_driver_id}",
                    (w - 250, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        # ═══ ALERT BANNER ═══
        if drowsiness_score > 60:
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, h - 50), (w, h), (0, 0, 200), -1)
            cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
            cv2.putText(frame, "!! DROWSINESS ALERT !!", (w // 2 - 180, h - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

        # Encode to JPEG for streaming
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

    # After camera stops, yield a blank "offline" frame
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(blank, "Camera Stopped", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (100, 100, 100), 2)
    ret, buffer = cv2.imencode('.jpg', blank)
    yield (b'--frame\r\n'
           b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')


# ═══════════════════════════════════════════
# FLASK ROUTES
# ═══════════════════════════════════════════

@app.route('/start_camera', methods=['POST'])
def start_camera():
    global cap, camera_active, current_driver_id
    data = request.json
    driver_id = data.get('driver_id')

    if not driver_id:
        return jsonify({"success": False, "error": "driver_id is required"}), 400

    if camera_active:
        return jsonify({"success": False, "error": "Camera already active. Turn OFF first."}), 400

    current_driver_id = driver_id
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        return jsonify({"success": False, "error": "Could not open webcam"}), 500

    camera_active = True
    print(f"🎥 Camera started for driver: {driver_id}")
    return jsonify({"success": True, "mode": "camera"})


@app.route('/stop_camera', methods=['POST'])
def stop_camera():
    global cap, camera_active, current_driver_id
    camera_active = False
    current_driver_id = None
    if cap is not None:
        cap.release()
        cap = None
    print("⏹️  Camera stopped")
    return jsonify({"success": True})


@app.route('/video_feed')
def video_feed():
    if not camera_active:
        return "Camera is off", 404
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/health')
def health():
    return jsonify({
        "status": "running",
        "camera_active": camera_active,
        "driver": current_driver_id
    })


if __name__ == '__main__':
    print("=" * 50)
    print("🎥 AI Dashcam Server — OpenCV Haar Cascades")
    print("=" * 50)
    print(f"  Port:      5001")
    print(f"  Node API:  {NODE_API_URL}")
    print(f"  Endpoints:")
    print(f"    POST /start_camera  {{driver_id: 'xxx'}}")
    print(f"    POST /stop_camera")
    print(f"    GET  /video_feed    MJPEG stream")
    print(f"    GET  /health")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
