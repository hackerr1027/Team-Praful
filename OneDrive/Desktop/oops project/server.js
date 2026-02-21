const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = 5500;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(__dirname));

// Serve dashboard at root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

let lastVehicles = {};
let telemetryHistory = {}; // In-memory storage instead of SQLite
let alerts = [];

// Store telemetry history (limit to last 200 entries per vehicle)
function storeTelemetry(veh) {
    if (!telemetryHistory[veh.id]) {
        telemetryHistory[veh.id] = [];
    }

    telemetryHistory[veh.id].push({
        lat: veh.lat,
        lon: veh.lon,
        speed: veh.speed || 0,
        status: veh.status || 'Unknown',
        destination: veh.destination || 'N/A',
        timestamp: new Date().toISOString()
    });

    // Keep only last 200 entries
    if (telemetryHistory[veh.id].length > 200) {
        telemetryHistory[veh.id].shift();
    }
}

// Check for speed violations and create alerts
function checkAlerts(veh) {
    if (veh.speed && veh.speed_limit && veh.speed > veh.speed_limit) {
        const excess = Math.round(veh.speed - veh.speed_limit);
        const severity = excess > 20 ? 'high' : excess > 10 ? 'medium' : 'low';

        // Only add alert if not already exists for this vehicle
        const existingAlert = alerts.find(a =>
            a.vehicle_id === veh.id &&
            a.alert_type === 'speed_violation' &&
            !a.resolved
        );

        if (!existingAlert) {
            alerts.push({
                id: Date.now(),
                vehicle_id: veh.id,
                alert_type: 'speed_violation',
                message: `Vehicle ${veh.id} exceeding speed limit by ${excess} km/h`,
                severity: severity,
                timestamp: new Date().toISOString(),
                resolved: false
            });

            console.log(`⚠️  ALERT: ${veh.id} speeding by ${excess} km/h`);
        }
    }
}

// Receives POST from C++ backend
app.post('/ingest', (req, res) => {
    const veh = req.body;

    if (!veh.id) {
        return res.status(400).send('Missing vehicle id');
    }

    console.log(`✓ ${veh.type} ${veh.id} -> ${veh.destination || 'N/A'} (${veh.speed?.toFixed(1)} km/h)`);

    // Store current state
    lastVehicles[veh.id] = veh;

    // Store in history
    storeTelemetry(veh);

    // Check for alerts
    checkAlerts(veh);

    res.status(200).send('OK');
});

// Get current fleet status
app.get('/fleet', (req, res) => {
    res.json(Object.values(lastVehicles));
});

// Get vehicle history
app.get('/vehicles/:id/history', (req, res) => {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const history = telemetryHistory[id] || [];
    res.json(history.slice(-limit).reverse());
});

// Get analytics for a vehicle
app.get('/analytics/:id', (req, res) => {
    const { id } = req.params;
    const history = telemetryHistory[id] || [];

    if (history.length === 0) {
        return res.json({
            data_points: 0,
            avg_speed: 0,
            max_speed: 0,
            current_distance: 0,
            current_waypoint: 0,
            total_waypoints: 0,
            route_name: 'Unknown'
        });
    }

    const speeds = history.map(h => h.speed);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const maxSpeed = Math.max(...speeds);

    const currentVehicle = lastVehicles[id];

    res.json({
        data_points: history.length,
        avg_speed: avgSpeed,
        max_speed: maxSpeed,
        first_seen: history[0].timestamp,
        last_seen: history[history.length - 1].timestamp,
        current_distance: currentVehicle?.distance_traveled || 0,
        current_waypoint: currentVehicle?.current_waypoint || 0,
        total_waypoints: currentVehicle?.total_waypoints || 0,
        route_name: currentVehicle?.route_name || 'Unknown'
    });
});

// Get active alerts
app.get('/alerts', (req, res) => {
    const activeAlerts = alerts.filter(a => !a.resolved).slice(-50);
    res.json(activeAlerts);
});

// Get alerts for specific vehicle
app.get('/alerts/:id', (req, res) => {
    const { id } = req.params;
    const vehicleAlerts = alerts.filter(a => a.vehicle_id === id && !a.resolved).slice(-20);
    res.json(vehicleAlerts);
});

// Resolve an alert
app.post('/alerts/:id/resolve', (req, res) => {
    const { id } = req.params;
    const alert = alerts.find(a => a.id === parseInt(id));
    if (alert) {
        alert.resolved = true;
    }
    res.send('OK');
});

// Serve routes.json file
app.get('/routes.json', (req, res) => {
    res.sendFile(__dirname + '/routes.json');
});

app.listen(port, () => {
    console.log('═══════════════════════════════════════════════');
    console.log('🚚 Fleet Management Server');
    console.log('═══════════════════════════════════════════════');
    console.log(`Port: ${port}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  POST /ingest              - Receive telemetry');
    console.log('  GET  /fleet               - Current fleet status');
    console.log('  GET  /vehicles/:id/history - Vehicle history');
    console.log('  GET  /analytics/:id       - Vehicle analytics');
    console.log('  GET  /alerts              - Active alerts');
    console.log('  GET  /routes.json         - Route definitions');
    console.log('═══════════════════════════════════════════════');
    console.log('Server ready! Waiting for vehicles...\n');
});
