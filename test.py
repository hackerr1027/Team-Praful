"""
AI Dashcam Test — Face Tilt, EAR & Yawn Detection
Uses only OpenCV (Haar cascades) — no MediaPipe needed.
Run: python test.py
Press 'Q' to quit.
"""

import cv2
import numpy as np
import math
import time

# ─── Load Haar Cascades (built into OpenCV) ───
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade  = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
mouth_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_smile.xml')

# ─── Thresholds ───
EYE_CLOSED_FRAMES = 15       # consecutive frames with no eyes detected = drowsy
YAWN_OPEN_RATIO   = 0.45     # mouth height / face height ratio
HEAD_TILT_ANGLE   = 15       # degrees

# ─── State ───
eye_closed_counter = 0
yawn_counter = 0
drowsiness_score = 0
alert_active = False

print("=" * 50)
print("🎥 AI Dashcam Test — OpenCV Only")
print("=" * 50)
print("  Detecting: Face Tilt | Eye Closure (EAR) | Yawning")
print("  Press 'Q' to quit")
print("=" * 50)

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("❌ ERROR: Could not open webcam!")
    print("   Make sure your camera is connected and not in use by another app.")
    exit(1)

print("✅ Webcam opened successfully!")

while True:
    ret, frame = cap.read()
    if not ret:
        break

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
            # Draw face box
            cv2.rectangle(frame, (fx, fy), (fx + fw, fy + fh), (0, 255, 0), 2)
            face_roi_gray = gray[fy:fy + fh, fx:fx + fw]
            face_roi_color = frame[fy:fy + fh, fx:fx + fw]

            # ═══ HEAD TILT ═══
            face_center_x = fx + fw // 2
            face_center_y = fy + fh // 2
            # Use face rectangle aspect ratio as proxy for tilt
            angle = math.degrees(math.atan2(fh - fw, fw + fh)) * 2
            tilt_text = f"Head Tilt: {int(angle)} deg"
            tilt_color = (0, 255, 0)

            if abs(angle) > HEAD_TILT_ANGLE:
                tilt_color = (0, 0, 255)
                drowsiness_score += 0.3
                cv2.putText(frame, "HEAD TILTED!", (fx, fy - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

            cv2.putText(frame, tilt_text, (20, h - 120),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, tilt_color, 2)

            # ═══ EYE DETECTION (EAR proxy) ═══
            upper_face = face_roi_gray[0:fh // 2, :]  # eyes are in upper half
            eyes = eye_cascade.detectMultiScale(upper_face, 1.1, 3, minSize=(25, 25))

            if len(eyes) >= 2:
                # Eyes open
                eye_closed_counter = 0
                drowsiness_score = max(0, drowsiness_score - 0.5)
                ear_text = f"Eyes: OPEN ({len(eyes)} detected)"
                ear_color = (0, 255, 0)

                for (ex, ey, ew, eh) in eyes[:2]:
                    cv2.rectangle(face_roi_color, (ex, ey), (ex + ew, ey + eh), (255, 255, 0), 2)
            elif len(eyes) == 1:
                eye_closed_counter += 1
                ear_text = f"Eyes: PARTIAL (1 detected)"
                ear_color = (0, 255, 255)
            else:
                # No eyes detected — likely closed
                eye_closed_counter += 1
                drowsiness_score += 0.5
                ear_text = f"Eyes: CLOSED ({eye_closed_counter} frames)"
                ear_color = (0, 0, 255)

            cv2.putText(frame, ear_text, (20, h - 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, ear_color, 2)

            if eye_closed_counter > EYE_CLOSED_FRAMES:
                cv2.putText(frame, "DROWSY - EYES CLOSED!", (w // 2 - 180, 60),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)
                drowsiness_score += 2

            # ═══ YAWN DETECTION ═══
            lower_face = face_roi_gray[fh // 2:, :]  # mouth is in lower half
            mouths = mouth_cascade.detectMultiScale(lower_face, 1.7, 11, minSize=(40, 20))

            yawn_detected = False
            if len(mouths) > 0:
                # Take the largest mouth detection
                mx, my, mw, mh = max(mouths, key=lambda m: m[2] * m[3])
                mouth_ratio = mh / fh

                if mouth_ratio > YAWN_OPEN_RATIO:
                    yawn_detected = True
                    yawn_counter += 1
                    drowsiness_score += 1.5
                    cv2.rectangle(face_roi_color,
                                  (mx, fh // 2 + my), (mx + mw, fh // 2 + my + mh),
                                  (0, 0, 255), 2)
                else:
                    yawn_counter = max(0, yawn_counter - 1)
                    cv2.rectangle(face_roi_color,
                                  (mx, fh // 2 + my), (mx + mw, fh // 2 + my + mh),
                                  (0, 255, 0), 1)

            yawn_text = f"Mouth: {'YAWNING!' if yawn_detected else 'Normal'}"
            yawn_color = (0, 0, 255) if yawn_detected else (0, 255, 0)
            cv2.putText(frame, yawn_text, (20, h - 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, yawn_color, 2)

            if yawn_counter > 10:
                cv2.putText(frame, "YAWNING - FATIGUE!", (w // 2 - 150, 100),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)

    # ═══ DROWSINESS SCORE BAR ═══
    drowsiness_score = max(0, min(100, drowsiness_score))
    bar_x, bar_y, bar_w, bar_h = 20, 20, 300, 25
    filled = int((drowsiness_score / 100) * bar_w)

    # Background
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (60, 60, 60), -1)
    # Filled portion (green -> yellow -> red)
    if drowsiness_score < 40:
        bar_color = (0, 200, 0)
    elif drowsiness_score < 70:
        bar_color = (0, 200, 255)
    else:
        bar_color = (0, 0, 255)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + filled, bar_y + bar_h), bar_color, -1)
    # Border
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (200, 200, 200), 2)
    cv2.putText(frame, f"Fatigue: {int(drowsiness_score)}%", (bar_x + bar_w + 10, bar_y + 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # ═══ ALERT BANNER ═══
    if drowsiness_score > 60:
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, h - 60), (w, h), (0, 0, 200), -1)
        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)
        cv2.putText(frame, "!! DROWSINESS ALERT — PULL OVER !!", (w // 2 - 250, h - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    # Show window
    cv2.imshow("AI Dashcam Test - Press Q to Quit", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("✅ Test complete. Camera released.")
