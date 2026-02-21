const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = 5500;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(__dirname));

// ═══════════════════════════════════════════════
// SUPABASE CONFIGURATION
// ═══════════════════════════════════════════════
const SUPABASE_URL = 'https://snjdtqodcplupqicvndx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuamR0cW9kY3BsdXBxaWN2bmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDMxOTIsImV4cCI6MjA4NzIxOTE5Mn0.tyMzdRqfGAvuIh1lawQHVDvUYkCSqnO-dZ_eEDcAzAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let supabaseConnected = false;

// Test Supabase connection on startup
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabase.from('vehicles').select('id').limit(1);
        if (error) {
            console.log('⚠️  Supabase tables not found. Please run supabase_setup.sql in the Supabase SQL Editor.');
            console.log(`   Error: ${error.message}`);
            supabaseConnected = false;
        } else {
            console.log('✅ Supabase connected successfully!');
            supabaseConnected = true;
        }
    } catch (err) {
        console.log('⚠️  Supabase connection failed:', err.message);
        supabaseConnected = false;
    }
}

// ═══════════════════════════════════════════════
// SUPABASE SYNC FUNCTIONS
// ═══════════════════════════════════════════════

// Upsert vehicle data to Supabase
async function syncVehicleToSupabase(veh) {
    if (!supabaseConnected) return;
    try {
        const { error } = await supabase.from('vehicles').upsert({
            id: veh.id,
            name: veh.name || veh.id,
            type: veh.type || 'Generic',
            lat: veh.lat,
            lon: veh.lon,
            speed: veh.speed || 0,
            speed_limit: veh.speed_limit || 60,
            status: veh.status || 'Idle',
            region: getVehicleRegion(veh.id),
            destination: veh.destination || null,
            cargo: veh.content || veh.cargo || null,
            route_name: veh.route_name || null,
            distance_traveled: veh.distance_traveled || 0,
            current_waypoint: veh.current_waypoint || 0,
            total_waypoints: veh.total_waypoints || 0,
            eta_minutes: veh.eta_minutes || 0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (error) console.error('Supabase vehicle sync error:', error.message);
    } catch (err) {
        console.error('Supabase vehicle sync failed:', err.message);
    }
}

// Store telemetry to Supabase
async function syncTelemetryToSupabase(veh) {
    if (!supabaseConnected) return;
    try {
        const { error } = await supabase.from('telemetry').insert({
            vehicle_id: veh.id,
            lat: veh.lat,
            lon: veh.lon,
            speed: veh.speed || 0,
            status: veh.status || 'Unknown',
            destination: veh.destination || null,
            recorded_at: new Date().toISOString()
        });

        if (error) console.error('Supabase telemetry sync error:', error.message);
    } catch (err) {
        console.error('Supabase telemetry sync failed:', err.message);
    }
}

// Sync alert to Supabase
async function syncAlertToSupabase(alert) {
    if (!supabaseConnected) return;
    try {
        const { error } = await supabase.from('alerts').insert({
            vehicle_id: alert.vehicle_id,
            alert_type: alert.alert_type,
            message: alert.message,
            severity: alert.severity,
            resolved: false,
            created_at: alert.timestamp
        });

        if (error) console.error('Supabase alert sync error:', error.message);
    } catch (err) {
        console.error('Supabase alert sync failed:', err.message);
    }
}

// Sync cargo to Supabase
async function syncCargoToSupabase(cargo) {
    if (!supabaseConnected) return;
    try {
        const { error } = await supabase.from('cargo').upsert({
            id: cargo.id,
            type: cargo.type,
            destination: cargo.destination,
            weight_kg: cargo.weight_kg,
            priority: cargo.priority,
            status: cargo.status,
            created_at: cargo.created_at
        }, { onConflict: 'id' });

        if (error) console.error('Supabase cargo sync error:', error.message);
    } catch (err) {
        console.error('Supabase cargo sync failed:', err.message);
    }
}

// ═══════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════

// Serve dashboard at root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

// Serve Command Center
app.get('/command-center', (req, res) => {
    res.sendFile(__dirname + '/command_center.html');
});

// ═══════════════════════════════════════════════
// IN-MEMORY STATE
// ═══════════════════════════════════════════════

let lastVehicles = {};
let telemetryHistory = {};
let alerts = [];

// Regions for Ahmedabad fleet operations
const REGIONS = ['North', 'South', 'East', 'West', 'Central'];
const VEHICLE_REGIONS = {};

// Pending cargo simulation
let pendingCargo = [];
let cargoIdCounter = 1;

function initPendingCargo() {
    const cargoTypes = ['Electronics', 'Industrial Goods', 'Documents', 'Food & Perishables', 'Construction Material', 'Medical Supplies'];
    const destinations = ['Naroda', 'SG Highway', 'Airport', 'Odhav GIDC', 'Satellite', 'Maninagar', 'Bopal', 'Chandkheda'];
    for (let i = 0; i < 5; i++) {
        const cargo = {
            id: `CARGO-${String(cargoIdCounter++).padStart(4, '0')}`,
            type: cargoTypes[Math.floor(Math.random() * cargoTypes.length)],
            destination: destinations[Math.floor(Math.random() * destinations.length)],
            weight_kg: Math.floor(Math.random() * 5000) + 200,
            priority: ['Low', 'Medium', 'High', 'Urgent'][Math.floor(Math.random() * 4)],
            created_at: new Date().toISOString(),
            status: 'Pending'
        };
        pendingCargo.push(cargo);
        syncCargoToSupabase(cargo); // Sync to Supabase
    }
}

// Periodically add new cargo
setInterval(() => {
    if (pendingCargo.filter(c => c.status === 'Pending').length < 8) {
        const cargoTypes = ['Electronics', 'Industrial Goods', 'Documents', 'Food & Perishables', 'Construction Material'];
        const destinations = ['Naroda', 'SG Highway', 'Airport', 'Odhav GIDC', 'Satellite'];
        const cargo = {
            id: `CARGO-${String(cargoIdCounter++).padStart(4, '0')}`,
            type: cargoTypes[Math.floor(Math.random() * cargoTypes.length)],
            destination: destinations[Math.floor(Math.random() * destinations.length)],
            weight_kg: Math.floor(Math.random() * 5000) + 200,
            priority: ['Low', 'Medium', 'High', 'Urgent'][Math.floor(Math.random() * 4)],
            created_at: new Date().toISOString(),
            status: 'Pending'
        };
        pendingCargo.push(cargo);
        syncCargoToSupabase(cargo);
    }
}, 30000);

// Assign region to vehicle based on its route or default
function getVehicleRegion(vehicleId) {
    if (!VEHICLE_REGIONS[vehicleId]) {
        if (vehicleId.startsWith('T')) VEHICLE_REGIONS[vehicleId] = 'East';
        else if (vehicleId.startsWith('V')) VEHICLE_REGIONS[vehicleId] = 'West';
        else if (vehicleId.startsWith('C')) VEHICLE_REGIONS[vehicleId] = 'Central';
        else VEHICLE_REGIONS[vehicleId] = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    }
    return VEHICLE_REGIONS[vehicleId];
}

// Enrich vehicle data with region and enhanced status
function enrichVehicle(veh) {
    const enriched = { ...veh };
    enriched.region = getVehicleRegion(veh.id);

    if (veh.status === 'Active') enriched.status = 'On Trip';
    else if (veh.status === 'In Shop') enriched.status = 'In Shop';
    else if (veh.status === 'Assigned') enriched.status = 'Assigned';
    else enriched.status = 'Idle';

    return enriched;
}

// Maintenance simulation
let maintenanceTimers = {};
function simulateMaintenance() {
    const vehicleIds = Object.keys(lastVehicles);
    vehicleIds.forEach(id => {
        if (!maintenanceTimers[id] && lastVehicles[id].status === 'Active' && Math.random() < 0.03) {
            lastVehicles[id].status = 'In Shop';
            maintenanceTimers[id] = setTimeout(() => {
                if (lastVehicles[id]) lastVehicles[id].status = 'Active';
                delete maintenanceTimers[id];
            }, 60000 + Math.random() * 60000);
            console.log(`🔧 ${id} sent to maintenance shop`);
            syncVehicleToSupabase(lastVehicles[id]); // Sync status change
        }
    });
}
setInterval(simulateMaintenance, 15000);

// Store telemetry history (in-memory, limited)
function storeTelemetry(veh) {
    if (!telemetryHistory[veh.id]) telemetryHistory[veh.id] = [];

    telemetryHistory[veh.id].push({
        lat: veh.lat, lon: veh.lon, speed: veh.speed || 0,
        status: veh.status || 'Unknown', destination: veh.destination || 'N/A',
        timestamp: new Date().toISOString()
    });

    if (telemetryHistory[veh.id].length > 200) telemetryHistory[veh.id].shift();
}

// Check for speed violations and create alerts
function checkAlerts(veh) {
    if (veh.speed && veh.speed_limit && veh.speed > veh.speed_limit) {
        const excess = Math.round(veh.speed - veh.speed_limit);
        const severity = excess > 20 ? 'high' : excess > 10 ? 'medium' : 'low';

        const existingAlert = alerts.find(a =>
            a.vehicle_id === veh.id && a.alert_type === 'speed_violation' && !a.resolved
        );

        if (!existingAlert) {
            const alert = {
                id: Date.now(),
                vehicle_id: veh.id,
                alert_type: 'speed_violation',
                message: `Vehicle ${veh.id} exceeding speed limit by ${excess} km/h`,
                severity: severity,
                timestamp: new Date().toISOString(),
                resolved: false
            };
            alerts.push(alert);
            syncAlertToSupabase(alert); // Sync to Supabase
            console.log(`⚠️  ALERT: ${veh.id} speeding by ${excess} km/h`);
        }
    }

    if (veh.status === 'In Shop') {
        const existingMaintAlert = alerts.find(a =>
            a.vehicle_id === veh.id && a.alert_type === 'maintenance' && !a.resolved
        );
        if (!existingMaintAlert) {
            const alert = {
                id: Date.now() + Math.random(),
                vehicle_id: veh.id,
                alert_type: 'maintenance',
                message: `Vehicle ${veh.id} is in maintenance shop`,
                severity: 'medium',
                timestamp: new Date().toISOString(),
                resolved: false
            };
            alerts.push(alert);
            syncAlertToSupabase(alert);
        }
    }
}

// ═══════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════

// Receives POST from C++ backend
app.post('/ingest', (req, res) => {
    const veh = req.body;

    if (!veh.id) return res.status(400).send('Missing vehicle id');

    // Preserve maintenance status if currently in shop
    if (lastVehicles[veh.id] && lastVehicles[veh.id].status === 'In Shop') {
        veh.status = 'In Shop';
        veh.speed = 0;
    }

    console.log(`✓ ${veh.type} ${veh.id} -> ${veh.destination || 'N/A'} (${veh.speed?.toFixed(1)} km/h)`);

    lastVehicles[veh.id] = veh;
    storeTelemetry(veh);
    checkAlerts(veh);

    // Sync to Supabase
    syncVehicleToSupabase(veh);
    syncTelemetryToSupabase(veh);

    res.status(200).send('OK');
});

// Get current fleet status with optional filters
app.get('/fleet', (req, res) => {
    let fleet = Object.values(lastVehicles).map(enrichVehicle);

    const { type, status, region } = req.query;
    if (type && type !== 'All') fleet = fleet.filter(v => v.type === type);
    if (status && status !== 'All') fleet = fleet.filter(v => v.status === status);
    if (region && region !== 'All') fleet = fleet.filter(v => v.region === region);

    res.json(fleet);
});

// Command Center aggregated data
app.get('/command-center-data', (req, res) => {
    const fleet = Object.values(lastVehicles).map(enrichVehicle);
    const total = fleet.length;

    const onTrip = fleet.filter(v => v.status === 'On Trip').length;
    const inShop = fleet.filter(v => v.status === 'In Shop').length;
    const assigned = fleet.filter(v => v.status === 'Assigned').length;
    const idle = fleet.filter(v => v.status === 'Idle').length;

    const utilizationRate = total > 0 ? ((onTrip + assigned) / total * 100) : 0;
    const pendingCargoCount = pendingCargo.filter(c => c.status === 'Pending').length;

    // Operational Health Score (0-100)
    const utilizationScore = Math.min(utilizationRate, 100);
    const maintenanceScore = total > 0 ? ((total - inShop) / total * 100) : 100;
    const totalAlerts = alerts.filter(a => !a.resolved && a.alert_type === 'speed_violation').length;
    const complianceScore = total > 0 ? Math.max(0, 100 - (totalAlerts / Math.max(total, 1) * 100)) : 100;
    const activeRatioScore = total > 0 ? (onTrip / total * 100) : 0;
    const lowIdleScore = total > 0 ? ((total - idle) / total * 100) : 100;

    const healthScore = Math.round(
        utilizationScore * 0.30 + maintenanceScore * 0.25 +
        complianceScore * 0.20 + activeRatioScore * 0.15 + lowIdleScore * 0.10
    );

    const fleetByType = {}, fleetByRegion = {};
    const fleetByStatus = { 'On Trip': onTrip, 'In Shop': inShop, 'Assigned': assigned, 'Idle': idle };
    fleet.forEach(v => {
        fleetByType[v.type] = (fleetByType[v.type] || 0) + 1;
        fleetByRegion[v.region] = (fleetByRegion[v.region] || 0) + 1;
    });

    const speeds = fleet.filter(v => v.speed > 0).map(v => v.speed);
    const avgFleetSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const totalDistance = fleet.reduce((sum, v) => sum + (v.distance_traveled || 0), 0);

    res.json({
        timestamp: new Date().toISOString(),
        supabaseConnected,
        kpis: {
            activeFleet: onTrip, maintenanceAlerts: inShop,
            utilizationRate: Math.round(utilizationRate * 10) / 10,
            pendingCargo: pendingCargoCount
        },
        healthScore: Math.min(healthScore, 100),
        healthBreakdown: {
            utilization: Math.round(utilizationScore), maintenance: Math.round(maintenanceScore),
            compliance: Math.round(complianceScore), activeRatio: Math.round(activeRatioScore),
            lowIdle: Math.round(lowIdleScore)
        },
        fleetByType, fleetByRegion, fleetByStatus,
        fleetSummary: {
            total, avgSpeed: Math.round(avgFleetSpeed * 10) / 10,
            totalDistance: Math.round(totalDistance * 10) / 10
        },
        pendingCargoList: pendingCargo.filter(c => c.status === 'Pending').slice(0, 10),
        recentAlerts: alerts.filter(a => !a.resolved).slice(-10).reverse()
    });
});

// Supabase status endpoint
app.get('/supabase-status', (req, res) => {
    res.json({ connected: supabaseConnected, url: SUPABASE_URL });
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
            data_points: 0, avg_speed: 0, max_speed: 0,
            current_distance: 0, current_waypoint: 0,
            total_waypoints: 0, route_name: 'Unknown'
        });
    }

    const speeds = history.map(h => h.speed);
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const maxSpeed = Math.max(...speeds);
    const currentVehicle = lastVehicles[id];

    res.json({
        data_points: history.length, avg_speed: avgSpeed, max_speed: maxSpeed,
        first_seen: history[0].timestamp, last_seen: history[history.length - 1].timestamp,
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
    res.json(alerts.filter(a => a.vehicle_id === id && !a.resolved).slice(-20));
});

// Resolve an alert
app.post('/alerts/:id/resolve', async (req, res) => {
    const { id } = req.params;
    const alert = alerts.find(a => a.id === parseInt(id));
    if (alert) {
        alert.resolved = true;
        // Sync resolution to Supabase
        if (supabaseConnected) {
            try {
                await supabase.from('alerts')
                    .update({ resolved: true })
                    .eq('vehicle_id', alert.vehicle_id)
                    .eq('alert_type', alert.alert_type)
                    .eq('resolved', false);
            } catch (err) { console.error('Supabase alert resolve error:', err.message); }
        }
    }
    res.send('OK');
});

// Serve routes.json file
app.get('/routes.json', (req, res) => {
    res.sendFile(__dirname + '/routes.json');
});

// ═══════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════

app.listen(port, async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('🚚 Fleet Management Server + Supabase');
    console.log('═══════════════════════════════════════════════');
    console.log(`Port: ${port}`);
    console.log(`Supabase: ${SUPABASE_URL}`);
    console.log('');
    console.log('Endpoints:');
    console.log('  POST /ingest                - Receive telemetry');
    console.log('  GET  /fleet                 - Current fleet (filterable)');
    console.log('  GET  /command-center        - Command Center UI');
    console.log('  GET  /command-center-data   - Aggregated KPIs');
    console.log('  GET  /supabase-status       - Supabase connection status');
    console.log('  GET  /vehicles/:id/history  - Vehicle history');
    console.log('  GET  /analytics/:id         - Vehicle analytics');
    console.log('  GET  /alerts                - Active alerts');
    console.log('  GET  /routes.json           - Route definitions');
    console.log('═══════════════════════════════════════════════');

    // Initialize
    await testSupabaseConnection();
    initPendingCargo();

    console.log('Server ready! Waiting for vehicles...\n');
});
