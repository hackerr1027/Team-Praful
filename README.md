# 🚛 MERIDIAN: Autonomous Fleet Management System (AFMS)

<p align="center">
  <b>Enterprise-Grade | Real-Time | AI-Integrated | Polyglot Architecture</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/AI-Python-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Engine-C++-00599C?logo=cplusplus&logoColor=white" />
  <img src="https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-orange" />
</p>

---

## 📌 Overview

**AFMS** is a full-stack, enterprise-level fleet operations platform that integrates:

- 🚗 Real-time fleet tracking  
- 📦 Intelligent trip dispatching  
- 🧠 AI-powered driver safety monitoring  
- 📊 Financial analytics & ROI tracking  
- ⚙️ High-performance C++ routing engine  
- 🔐 Data integrity with PostgreSQL triggers  

It blends **web technologies**, **low-level optimization algorithms**, and **computer vision AI** into one unified system.

---

# 🏗 System Architecture
Frontend (HTML/CSS/JS + Chart.js + Leaflet)

↓

Node.js REST API (Express.js)

↓

Supabase PostgreSQL Database

↓

C++ Optimization Engine (Routing & Allocation)

↓

Python AI Engine (Drowsiness Detection)


---

# 🖥 Tech Stack

| Layer | Technology |
|-------|------------|
| Backend API | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Optimization Engine | C++ (`cpp-httplib`) |
| AI Module | Python + OpenCV + MediaPipe |
| Frontend | HTML5, CSS3, Vanilla JS |
| Charts | Chart.js |
| Maps | Leaflet.js + OpenStreetMap |

---

# 📊 Core Modules

---

## 🚛 1. Trip Dispatching Engine

### Lifecycle State Machine
Draft → Dispatched → In Transit → Completed


### Features

- Soft locking system (5-minute vehicle reservation)
- Driver license validation
- Vehicle capacity enforcement
- Optimistic concurrency control (`version` column)
- Automatic odometer updates
- Real-time map movement simulation

---

## 🧠 2. AI Driver Safety System

### Powered by:
- OpenCV
- MediaPipe Face Mesh
- EAR & MAR logic
- Real-time alert broadcasting

### Detection Logic

| Metric | Purpose |
|--------|---------|
| EAR (Eye Aspect Ratio) | Detect closed eyes |
| MAR (Mouth Aspect Ratio) | Detect yawning |
| Frame Threshold | Prevent false positives |

### Process Flow

1. Webcam feed capture  
2. Facial landmark detection  
3. EAR/MAR computation  
4. Threshold validation  
5. Local alarm (pygame)  
6. POST alert to backend  
7. Broadcast to Safety Officer UI  

---

## 🗺 3. Live Command Center

- Real-time vehicle GPS plotting  
- Dynamic status updates  
- Supabase latency monitoring  
- Active trip visualization  
- Fleet status dashboard  

---

## ⚙️ 4. C++ Allocation & Routing Engine

### Why C++?

For high-performance:
- Graph traversal
- Pathfinding (A* / Dijkstra simulation)
- Driver-vehicle assignment optimization

### Capabilities

- Weighted adjacency graph modeling
- Dynamic traffic simulation
- Greedy & cost-based allocation algorithm
- Independent service listening on separate port

---

## 📈 5. Financial Analytics Engine

### KPI Calculations

| Metric | Formula |
|--------|----------|
| Cost per KM | Total Fuel Cost / Distance |
| Fuel Efficiency | Distance / Fuel Liters |
| Revenue | Revenue per KM × Distance |
| ROI % | ((Revenue − Fuel Cost) / Acquisition Cost) × 100 |

### Smart Fallback Logic

If trip distance is missing:
- Uses vehicle `odometer_km`
- Aggregates fuel logs
- Ensures long-term financial consistency

### Visualizations

- 📊 Monthly expense line charts
- 🍩 Cost breakdown doughnut charts
- 📉 Asset performance bar charts

---

# 🗄 Database Schema Highlights

### `vehicles`
- Odometer rollback prevention trigger
- Registry status locking
- Live tracking status

### `drivers`
- License enforcement
- Trip-aware availability status

### `trips`
- Full lifecycle management
- Optimistic locking
- Capacity validation

### `service_logs`
- Auto vehicle locking on open maintenance
- Auto unlock when closed

### `fuel_logs` & `financial_metrics`
- Fleet-wide ROI calculation
- Efficiency tracking
- Cost automation

---

# 🔐 Data Integrity & Concurrency

- PostgreSQL triggers
- Optimistic locking
- Server-side validation
- Transaction-safe status updates
- Soft-lock timeout mechanism

---

# 📡 API Endpoints

### Vehicles
    
    GET /api/vehicles
    
    POST /api/vehicles
    
    PATCH /api/vehicles/:id


### Drivers

    GET /api/drivers
    
    POST /api/drivers


### Trips

    GET /api/trips
    
    POST /api/trips
    
    PATCH /api/trips/:id/status


### Maintenance

    GET /api/service-logs
    
    POST /api/service-logs


### Financial

    GET /api/financial/summary
    
    POST /api/financial/fuel-logs


---

# 🧪 AI Drowsiness Detection Sample


      if ear < 0.25:
      
            closed_frames += 1
            
            if closed_frames > threshold:
            
                trigger_alert()

###🚀 How to Run

1️⃣ Backend

    npm install

    node server.js

2️⃣ C++ Engine

    g++ afms_backend.cpp -o afms_backend.exe
    
    ./afms_backend.exe

3️⃣ AI Module

    pip install opencv-python mediapipe pygame
    
    python dashcam_drowsiness.py

4️⃣ Open Frontend

Open:

    index.html
    
    command_center.html
    
    trip_dispatcher.html
    
    financial_analytics.html

🏆 Enterprise-Level Features

✔ Polyglot architecture

✔ AI integration with backend

✔ Real-time map visualization

✔ Financial KPI automation

✔ Database triggers for integrity

✔ Optimistic concurrency control

✔ C++ high-performance allocation engine

📷 UI Preview (Suggested Structure)

/screenshots

    dashboard.png
    
    trip_dispatch.png
    
    command_center.png
    
    analytics.png
    
    drowsiness_alert.png

Add real screenshots for maximum impact.


# 📈 Scalability Potential

- Dockerization

- Kubernetes deployment

- WebSocket live telemetry

- Real GPS IoT device integration

- Cloud AI inference server

- Predictive maintenance using ML

# 🧩 Future Roadmap

- ML-based fuel consumption prediction

- Reinforcement learning dispatch optimizer

- Driver risk scoring model

- Fleet carbon emission tracker

- Multi-tenant SaaS architecture

# 🏁 Conclusion

- AFMS is not just a fleet tracker.

- It is a complete enterprise mobility intelligence platform integrating:

- Systems programming (C++)

- Artificial Intelligence (Python)

Scalable backend engineering (Node.js)

Database integrity design (PostgreSQL)

Financial modeling

Real-time telemetry visualization
