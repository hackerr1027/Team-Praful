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

// Get current fleet status with optional filters (Live tracking view)
app.get('/fleet', async (req, res) => {
    let fleet = [];
    if (supabaseConnected) {
        const { data } = await supabase.from('vehicles').select('*');
        if (data) fleet = data;
    } else {
        fleet = Object.values(lastVehicles);
    }

    fleet = fleet.map(v => {
        const telemetry = lastVehicles[v.id] || {};
        const merged = { ...v, ...telemetry };

        // Provide Depot default coordinates to vehicles without live telemetry
        if (!merged.lat) merged.lat = 23.0400 + (Math.random() * 0.01);
        if (!merged.lon) merged.lon = 72.5700 + (Math.random() * 0.01);

        // Registry status overrides telemetry status if unavailable
        if (v.registry_status && v.registry_status !== 'Available') {
            merged.status = v.registry_status;
        } else {
            merged.status = telemetry.status || v.registry_status || 'Available';
        }
        return merged;
    }).map(enrichVehicle);

    const { type, status, region } = req.query;
    if (type && type !== 'All') fleet = fleet.filter(v => v.type === type);
    if (status && status !== 'All') fleet = fleet.filter(v => v.status === status);
    if (region && region !== 'All') fleet = fleet.filter(v => v.region === region);

    res.json(fleet);
});

// Command Center aggregated data
app.get('/command-center-data', async (req, res) => {
    let rawFleet = [];
    if (supabaseConnected) {
        const { data } = await supabase.from('vehicles').select('*');
        if (data) rawFleet = data;
    } else {
        rawFleet = Object.values(lastVehicles);
    }

    const fleet = rawFleet.map(v => {
        const telemetry = lastVehicles[v.id] || {};
        const merged = { ...v, ...telemetry };
        if (v.registry_status && v.registry_status !== 'Available') {
            merged.status = v.registry_status;
        } else {
            merged.status = telemetry.status || v.registry_status || 'Available';
        }
        return merged;
    }).map(enrichVehicle);

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
    const alert = alerts.find(a => String(a.id) === String(id)) || alerts.find(a => a.id === parseFloat(id));
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
// TRIP DISPATCHER & MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════

// Serve Trip Dispatcher page
app.get('/trip-dispatcher', (req, res) => {
    res.sendFile(__dirname + '/trip_dispatcher.html');
});

// Serve Safety Officer Dashboard
app.get('/safety-officer', (req, res) => {
    res.sendFile(__dirname + '/safety_officer.html');
});

// ─── DRIVERS API ───

// Get all drivers
app.get('/api/drivers', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { data, error } = await supabase.from('drivers').select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// Get available drivers (filtered for trip assignment)
app.get('/api/available-drivers', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { session_id } = req.query;

    let query = supabase.from('drivers').select('*')
        .in('status', ['Available'])
        .order('name');

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Filter out drivers with active soft locks from OTHER dispatchers
    const now = new Date();
    const available = (data || []).filter(d => {
        if (d.soft_lock_expires && new Date(d.soft_lock_expires) > now) {
            if (session_id && d.soft_lock_by === session_id) return true; // Keep if we locked it
            if (d.soft_lock_by) return false; // Hide if someone else locked it
        }
        return true;
    });

    res.json(available);
});

// Add a new driver
app.post('/api/drivers', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });

    const driver = req.body;
    if (!driver.name || !driver.license_number) {
        return res.status(400).json({ error: 'Name and license number are required' });
    }

    const { data, error } = await supabase.from('drivers').insert({
        name: driver.name,
        phone: driver.phone || null,
        email: driver.email || null,
        license_number: driver.license_number,
        license_class: driver.license_class || 'Medium',
        license_expiry: driver.license_expiry || null,
        status: 'Available',
        region: driver.region || 'Central',
        shift_start: driver.shift_start || '08:00',
        shift_end: driver.shift_end || '20:00',
        max_daily_hours: driver.max_daily_hours || 10,
        blood_group: driver.blood_group || null,
        emergency_contact: driver.emergency_contact || null,
        address: driver.address || null,
        notes: driver.notes || null
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });

    // Audit log
    await logDispatchAudit('Driver', data.id, 'CREATE', null, data, 'Dispatcher');
    res.status(201).json(data);
});

// Update driver
app.patch('/api/drivers/:id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });

    const { id } = req.params;
    const updates = req.body;
    updates.updated_at = new Date().toISOString();

    const { data: old } = await supabase.from('drivers').select('*').eq('id', id).single();
    const { data, error } = await supabase.from('drivers').update(updates).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logDispatchAudit('Driver', id, 'UPDATE', old, data, 'Dispatcher');
    res.json(data);
});

// Update driver status
app.patch('/api/drivers/:id/status', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const { id } = req.params;
    const { status } = req.body;

    const DRIVER_STATUSES = ['Available', 'On Duty', 'Off Duty', 'Suspended', 'Retired'];
    if (!DRIVER_STATUSES.includes(status)) {
        return res.status(400).send('Invalid status');
    }

    const updates = { status, updated_at: new Date().toISOString() };
    const { data: old } = await supabase.from('drivers').select('*').eq('id', id).single();
    if (!old) return res.status(404).send('Driver not found');

    const { data, error } = await supabase.from('drivers').update(updates).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logDispatchAudit('Driver', id, 'STATUS_CHANGE', old, data, 'Safety Officer');
    res.json(data);
});

// Delete driver
app.delete('/api/drivers/:id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const { id } = req.params;

    // Check if driver has active or historical trips
    const { count } = await supabase.from('trips').select('*', { count: 'exact', head: true }).eq('driver_id', id);
    if (count > 0) return res.status(409).json({ error: 'Cannot delete driver with existing trip history. Retire them or change status instead.' });

    const { data: old } = await supabase.from('drivers').select('*').eq('id', id).single();
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    await logDispatchAudit('Driver', id, 'DELETE', old, null, 'Dispatcher');
    res.json({ success: true });
});

// ─── LOCATIONS API ───

app.get('/api/locations', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { data, error } = await supabase.from('locations').select('*').eq('is_active', true).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// ─── VEHICLE REGISTRY API ───

app.get('/api/vehicles', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { status } = req.query;
    let query = supabase.from('vehicles').select('*').order('name');
    if (status && status !== 'All') {
        if (status === 'Available') {
            // For dispatcher dropdown, exclude unavailable ones explicitly
            query = query.in('registry_status', ['Available']);
        } else {
            query = query.eq('registry_status', status);
        }
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/vehicles', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const v = req.body;
    if (!v.id || !v.name || !v.license_plate) return res.status(400).json({ error: 'ID, Name, and License Plate required' });

    const { data, error } = await supabase.from('vehicles').insert({
        id: v.id, name: v.name, type: v.type || 'Generic',
        license_plate: v.license_plate, max_capacity_kg: v.max_capacity_kg || 2000,
        odometer_km: v.odometer_km || 0, registry_status: v.registry_status || 'Available'
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
});

app.patch('/api/vehicles/:id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    const { data, error } = await supabase.from('vehicles').update(updates).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
});

app.delete('/api/vehicles/:id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const { id } = req.params;

    // Check if it has active trips
    const { count } = await supabase.from('trips').select('*', { count: 'exact', head: true }).eq('vehicle_id', id).in('status', ['Draft', 'Dispatched']);
    if (count > 0) return res.status(409).json({ error: 'Cannot delete vehicle with active trips. Retire it instead.' });

    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
});

// ─── SERVICE LOGS API ───

app.get('/api/service-logs', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { vehicle_id } = req.query;
    let query = supabase.from('service_logs').select('*, vehicles(name, license_plate)').order('created_at', { ascending: false });
    if (vehicle_id) query = query.eq('vehicle_id', vehicle_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/service-logs', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const log = req.body;
    if (!log.vehicle_id || !log.service_type) return res.status(400).json({ error: 'Vehicle ID and Service Type required' });

    // Verify vehicle isn't on an active trip before sending to shop
    const { count } = await supabase.from('trips').select('*', { count: 'exact', head: true }).eq('vehicle_id', log.vehicle_id).eq('status', 'Dispatched');
    if (count > 0) return res.status(409).json({ error: 'Vehicle is currently Dispatched on a trip. Cannot send to shop.' });

    const { data, error } = await supabase.from('service_logs').insert({
        vehicle_id: log.vehicle_id, service_type: log.service_type,
        notes: log.notes || '', status: 'Open'
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });

    // Also update in-memory status for live tracking
    if (lastVehicles[log.vehicle_id]) {
        lastVehicles[log.vehicle_id].status = 'In Shop';
        lastVehicles[log.vehicle_id].speed = 0;
    }

    res.status(201).json(data);
});

app.patch('/api/service-logs/:id/close', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const { id } = req.params;

    const { data: log, error: fetchErr } = await supabase.from('service_logs').select('*').eq('id', id).single();
    if (fetchErr || !log) return res.status(404).json({ error: 'Log not found' });
    if (log.status === 'Closed') return res.status(400).json({ error: 'Log already closed' });

    const { data, error } = await supabase.from('service_logs').update({
        status: 'Closed', end_date: new Date().toISOString(),
        notes: req.body.notes || log.notes, updated_at: new Date().toISOString()
    }).eq('id', id).select().single();

    if (error) return res.status(400).json({ error: error.message });

    // Trigger automatically updates registry_status. Let's update in-memory to Idle so map picks it up.
    if (lastVehicles[data.vehicle_id]) lastVehicles[data.vehicle_id].status = 'Idle';

    res.json(data);
});

// ─── TRIPS API ───

// Get all trips
app.get('/api/trips', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { status } = req.query;
    let query = supabase.from('trips').select('*, drivers(name, license_number, phone)').order('created_at', { ascending: false });
    if (status && status !== 'All') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with vehicle info from in-memory
    const enriched = (data || []).map(trip => ({
        ...trip,
        vehicle_info: lastVehicles[trip.vehicle_id] ? {
            type: lastVehicles[trip.vehicle_id].type,
            name: lastVehicles[trip.vehicle_id].name,
            speed: lastVehicles[trip.vehicle_id].speed,
            status: lastVehicles[trip.vehicle_id].status
        } : null
    }));
    res.json(enriched);
});

// Validate trip (without saving)
app.post('/api/trips/validate', async (req, res) => {
    const tripData = req.body;
    const result = await validateTrip(tripData);
    res.json(result);
});

// Create trip (Draft)
app.post('/api/trips', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });

    const tripData = req.body;

    // Run validation
    const validation = await validateTrip(tripData);
    if (!validation.canProceed) {
        return res.status(422).json({ errors: validation.errors || [], warnings: validation.warnings || [], info: validation.info || [] });
    }

    // Create the trip
    const { data, error } = await supabase.from('trips').insert({
        vehicle_id: tripData.vehicle_id,
        driver_id: tripData.driver_id,
        origin_name: tripData.origin_name,
        destination_name: tripData.destination_name,
        origin_lat: tripData.origin_lat || null,
        origin_lon: tripData.origin_lon || null,
        destination_lat: tripData.destination_lat || null,
        destination_lon: tripData.destination_lon || null,
        pickup_time: tripData.pickup_time,
        delivery_deadline: tripData.delivery_deadline,
        cargo_description: tripData.cargo_description,
        cargo_type: tripData.cargo_type || 'General',
        cargo_weight_kg: tripData.cargo_weight_kg || 0,
        estimated_distance_km: tripData.estimated_distance_km || null,
        estimated_duration_min: tripData.estimated_duration_min || null,
        warnings_acknowledged: validation.warnings.length > 0 ? JSON.stringify(validation.warnings) : '[]',
        status: 'Draft',
        created_by: 'Dispatcher'
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });

    await logDispatchAudit('Trip', data.id, 'CREATE', null, data, 'Dispatcher');
    res.status(201).json({ trip: data, validation });
});

// Transition trip status
app.patch('/api/trips/:id/status', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });

    const { id } = req.params;
    const { status: newStatus, reason, version } = req.body;

    // Get current trip
    const { data: trip, error: fetchError } = await supabase.from('trips').select('*').eq('id', id).single();
    if (fetchError || !trip) return res.status(404).json({ error: 'Trip not found' });

    // Optimistic locking check
    if (version && trip.version !== version) {
        return res.status(409).json({ error: 'Trip was modified by another user. Please refresh.' });
    }

    // Validate transition
    const allowed = getValidTransitions(trip.status);
    if (!allowed.includes(newStatus)) {
        return res.status(403).json({ error: `Cannot transition from ${trip.status} to ${newStatus}` });
    }

    // Build update
    const update = { status: newStatus, version: trip.version + 1, updated_at: new Date().toISOString() };

    if (newStatus === 'Dispatched') {
        // Re-validate before dispatch
        const validation = await validateTrip(trip);
        if (!validation.canProceed) {
            return res.status(422).json({ errors: validation.errors });
        }
        update.dispatched_at = new Date().toISOString();
        update.dispatched_by = 'Dispatcher';

        // Update driver + vehicle status
        if (trip.driver_id) {
            await supabase.from('drivers').update({ status: 'On Trip', updated_at: new Date().toISOString() }).eq('id', trip.driver_id);
        }
    }

    if (newStatus === 'Completed') {
        update.completed_at = new Date().toISOString();
        update.actual_arrival = new Date().toISOString();

        // Release driver
        if (trip.driver_id) {
            await supabase.from('drivers').update({
                status: 'Available',
                last_trip_ended_at: new Date().toISOString(),
                total_trips_completed: (trip.drivers?.total_trips_completed || 0) + 1,
                updated_at: new Date().toISOString()
            }).eq('id', trip.driver_id);
        }
    }

    if (newStatus === 'Cancelled') {
        update.cancelled_at = new Date().toISOString();
        update.cancellation_reason = reason || 'No reason provided';

        // Release driver
        if (trip.driver_id) {
            await supabase.from('drivers').update({ status: 'Available', updated_at: new Date().toISOString() }).eq('id', trip.driver_id);
        }
    }

    const { data, error } = await supabase.from('trips').update(update).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    await logDispatchAudit('Trip', id, 'STATUS_CHANGE',
        { status: trip.status }, { status: newStatus, reason }, 'Dispatcher');

    res.json(data);
});

// Delete trip (only drafts)
app.delete('/api/trips/:id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Supabase not connected' });
    const { id } = req.params;
    const { data: trip } = await supabase.from('trips').select('*').eq('id', id).single();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status !== 'Draft') return res.status(403).json({ error: 'Only draft trips can be deleted' });

    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    await logDispatchAudit('Trip', id, 'DELETE', trip, null, 'Dispatcher');
    res.json({ success: true });
});

// Get trip audit history
app.get('/api/trips/:id/audit', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    const { id } = req.params;
    const { data, error } = await supabase.from('dispatch_audit_logs')
        .select('*').eq('entity_type', 'Trip').eq('entity_id', id)
        .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// Get dispatcher dashboard stats
app.get('/api/dispatcher-stats', async (req, res) => {
    if (!supabaseConnected) return res.json({ total: 0, draft: 0, dispatched: 0, completed: 0, cancelled: 0, drivers: 0 });

    const { data: trips } = await supabase.from('trips').select('status');
    const { data: drivers } = await supabase.from('drivers').select('status');

    const tripStats = { total: 0, Draft: 0, Dispatched: 0, Completed: 0, Cancelled: 0 };
    (trips || []).forEach(t => { tripStats.total++; tripStats[t.status] = (tripStats[t.status] || 0) + 1; });

    const driverStats = { total: 0, Available: 0, 'On Trip': 0, 'Off Duty': 0 };
    (drivers || []).forEach(d => { driverStats.total++; driverStats[d.status] = (driverStats[d.status] || 0) + 1; });

    res.json({ trips: tripStats, drivers: driverStats });
});

// ─── VALIDATION ENGINE OOP ───

function getValidTransitions(currentStatus) {
    const transitions = {
        'Draft': ['Dispatched', 'Cancelled'],
        'Dispatched': ['Completed', 'Cancelled'],
        'Completed': [],
        'Cancelled': []
    };
    return transitions[currentStatus] || [];
}

function getVehicleCapacity(type) {
    const caps = { 'Truck': 8000, 'Van': 3000, 'Car': 500 };
    return caps[type] || 2000;
}

class ValidationContext {
    constructor(tripData, vehicle, conflicts, driverConflicts) {
        this.tripData = tripData;
        this.vehicle = vehicle;
        this.conflicts = conflicts || [];
        this.driverConflicts = driverConflicts || [];
        this.errors = [];
        this.warnings = [];
        this.info = [];
        this.canProceed = true;
    }
    addError(id, label, message) {
        this.errors.push({ id, label, message });
        this.canProceed = false;
    }
    addWarning(id, label, message) {
        this.warnings.push({ id, label, message });
    }
}

class ValidationRule { validate(ctx) { throw new Error('Not implemented'); } }

class CapacityRule extends ValidationRule {
    validate(ctx) {
        if (!ctx.tripData.vehicle_id || !ctx.tripData.cargo_weight_kg || !ctx.vehicle) return;

        // Use registry max_capacity if available, else fallback
        const maxCap = ctx.vehicle.max_capacity_kg || getVehicleCapacity(ctx.vehicle.type);

        if (ctx.tripData.cargo_weight_kg > maxCap) {
            ctx.addError('V-001', 'Overweight', `Cargo (${ctx.tripData.cargo_weight_kg}kg) exceeds vehicle capacity (${maxCap}kg) by ${ctx.tripData.cargo_weight_kg - maxCap}kg`);
        } else if (ctx.tripData.cargo_weight_kg > maxCap * 0.85) {
            const pct = ((ctx.tripData.cargo_weight_kg / maxCap) * 100).toFixed(1);
            ctx.addWarning('W-001', 'Near Capacity', `Cargo at ${pct}% of vehicle capacity (${maxCap}kg)`);
        }
    }
}

class ScheduleConflictRule extends ValidationRule {
    validate(ctx) {
        if (!ctx.tripData.pickup_time || !ctx.tripData.delivery_deadline) return;

        const pickup = new Date(ctx.tripData.pickup_time);
        const deadline = new Date(ctx.tripData.delivery_deadline);

        if (pickup < new Date()) {
            ctx.addError('V-002', 'Past Pickup', 'Pickup time cannot be in the past');
        } else {
            const diffMin = (pickup - new Date()) / 60000;
            if (diffMin < 30) ctx.addWarning('W-002', 'Tight Schedule', `Only ${Math.round(diffMin)} minutes until pickup`);
        }

        if (deadline <= pickup) {
            ctx.addError('V-003', 'Invalid Deadline', 'Delivery deadline must be after pickup time');
        }

        const vf = ctx.conflicts.filter(c => c.id !== ctx.tripData.id);
        if (vf.length > 0) {
            ctx.addError('V-006', 'Schedule Conflict', `Vehicle has a conflicting trip #${vf[0].trip_number} (${vf[0].status})`);
        }

        const df = ctx.driverConflicts.filter(c => c.id !== ctx.tripData.id);
        if (df.length > 0) {
            ctx.addError('V-007', 'Driver Conflict', `Driver has a conflicting trip #${df[0].trip_number}`);
        }
    }
}

class RequiredFieldsRule extends ValidationRule {
    validate(ctx) {
        const { tripData } = ctx;
        if (!tripData.vehicle_id) ctx.addError('V-005', 'Missing Vehicle', 'Please select a vehicle');
        if (!tripData.driver_id) ctx.addError('V-005', 'Missing Driver', 'Please select a driver');
        if (!tripData.origin_name) ctx.addError('V-005', 'Missing Origin', 'Please select an origin');
        if (!tripData.destination_name) ctx.addError('V-005', 'Missing Destination', 'Please select a destination');
        if (!tripData.pickup_time) ctx.addError('V-005', 'Missing Pickup Time', 'Please set a pickup time');
        if (!tripData.delivery_deadline) ctx.addError('V-005', 'Missing Deadline', 'Please set a delivery deadline');
        if (ctx.vehicle) {
            if (ctx.vehicle.status === 'In Shop' || ctx.vehicle.registry_status === 'In Shop') {
                ctx.addError('V-004', 'Vehicle Unavailable', `Vehicle ${tripData.vehicle_id} is currently in maintenance`);
            } else if (ctx.vehicle.registry_status === 'Out of Service') {
                ctx.addError('V-004', 'Vehicle Unavailable', `Vehicle ${tripData.vehicle_id} is retired from service`);
            }
        }
    }
}

const validationEngine = [
    new CapacityRule(),
    new ScheduleConflictRule(),
    new RequiredFieldsRule()
];

async function validateTrip(tripData) {
    let vehicle = null, vehicleConflicts = [], driverConflicts = [];
    if (tripData.vehicle_id && supabaseConnected) {
        // Fetch from canonical registry to get capacity & exact status
        const { data: vReg } = await supabase.from('vehicles').select('*').eq('id', tripData.vehicle_id).single();
        if (vReg) vehicle = vReg;
        else vehicle = lastVehicles[tripData.vehicle_id]; // fallback
    } else if (tripData.vehicle_id) {
        vehicle = lastVehicles[tripData.vehicle_id];
    }

    // Vehicle registry status check
    if (vehicle && vehicle.registry_status) {
        if (vehicle.registry_status === 'In Shop') tripData._registry_unavailable = 'Maintenance (In Shop)';
        if (vehicle.registry_status === 'Out of Service') tripData._registry_unavailable = 'Retired (Out of Service)';
    }

    if (supabaseConnected && tripData.pickup_time && tripData.delivery_deadline) {
        if (tripData.vehicle_id) {
            const { data } = await supabase.from('trips').select('id, trip_number, status')
                .eq('vehicle_id', tripData.vehicle_id).in('status', ['Draft', 'Dispatched'])
                .lt('pickup_time', tripData.delivery_deadline).gt('delivery_deadline', tripData.pickup_time);
            vehicleConflicts = data || [];
        }
        if (tripData.driver_id) {
            const { data } = await supabase.from('trips').select('id, trip_number, status')
                .eq('driver_id', tripData.driver_id).in('status', ['Draft', 'Dispatched'])
                .lt('pickup_time', tripData.delivery_deadline).gt('delivery_deadline', tripData.pickup_time);
            driverConflicts = data || [];
        }
    }

    const ctx = new ValidationContext(tripData, vehicle, vehicleConflicts, driverConflicts);
    for (const rule of validationEngine) {
        rule.validate(ctx);
    }

    return {
        errors: ctx.errors,
        warnings: ctx.warnings,
        info: ctx.info,
        canProceed: ctx.canProceed
    };
}

// ─── AUDIT LOGGING ───

async function logDispatchAudit(entityType, entityId, action, oldValue, newValue, performedBy, reason) {
    if (!supabaseConnected) return;
    try {
        await supabase.from('dispatch_audit_logs').insert({
            entity_type: entityType,
            entity_id: String(entityId),
            action: action,
            old_value: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
            new_value: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
            performed_by: performedBy || 'System',
            reason: reason || null
        });
    } catch (err) {
        console.error('Dispatch audit log error:', err.message);
    }
}

// ─── SOFT LOCK API & CLEANUP ───
app.post('/api/vehicles/:id/soft-lock', async (req, res) => {
    if (!supabaseConnected) return res.json({ success: false });
    const { id } = req.params;
    const { user_id } = req.body;

    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + 60); // lock for 60s

    // Check if vehicle is locked by someone else
    const { data: vehicle } = await supabase.from('vehicles').select('soft_lock_by, soft_lock_expires').eq('id', id).single();
    if (vehicle && vehicle.soft_lock_expires && new Date(vehicle.soft_lock_expires) > new Date() && vehicle.soft_lock_by && vehicle.soft_lock_by !== user_id) {
        return res.status(409).json({ error: 'Vehicle currently reserved by another dispatcher' });
    }

    const { error } = await supabase.from('vehicles').update({
        soft_lock_by: null, // Avoids FKEY constraint violations
        soft_lock_expires: expires.toISOString()
    }).eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, expires });
});

app.post('/api/drivers/:id/soft-lock', async (req, res) => {
    if (!supabaseConnected) return res.json({ success: false });
    const { id } = req.params;
    const { user_id } = req.body;

    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + 60);

    const { data: driver } = await supabase.from('drivers').select('soft_lock_by, soft_lock_expires').eq('id', id).single();
    if (driver && driver.soft_lock_expires && new Date(driver.soft_lock_expires) > new Date() && driver.soft_lock_by && driver.soft_lock_by !== user_id) {
        return res.status(409).json({ error: 'Driver currently reserved by another dispatcher' });
    }

    const { error } = await supabase.from('drivers').update({
        soft_lock_by: null, // Avoids FKEY constraint violations
        soft_lock_expires: expires.toISOString()
    }).eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, expires });
});

// ═══════════════════════════════════════════════
// DROWSINESS DETECTION ENDPOINT (DASHCAM) & SAFETY DISPATCH
// ═══════════════════════════════════════════════

// Simulate pre-dispatch check
app.post('/api/dispatch/check', async (req, res) => {
    const { driver_id, vehicle_id } = req.body;

    // Fetch driver from Supabase
    if (!supabaseConnected) return res.status(503).json({ allowed: false, reason: 'Supabase disconnected' });
    const { data: driver } = await supabase.from('drivers').select('*').eq('id', driver_id).single();

    if (!driver) return res.status(404).json({ allowed: false, reason: 'Driver not found in registry' });

    // 1. Check suspended status
    if (driver.status === 'Suspended') {
        return res.json({ allowed: false, reason: `Driver ${driver.id} is Suspended.` });
    }

    // 2. Check license expiry
    const today = new Date().toISOString().split('T')[0];
    if (driver.license_expiry && driver.license_expiry < today) {
        return res.json({ allowed: false, reason: `Driver ${driver.id} license expired on ${driver.license_expiry}.` });
    }

    // 3. Check hours
    if (typeof driver.hours_driven_today === 'number' && typeof driver.max_daily_hours === 'number' && driver.hours_driven_today >= driver.max_daily_hours) {
        return res.json({ allowed: false, reason: `Driver ${driver.id} reached max daily limit (${driver.max_daily_hours}h).` });
    }

    // 4. Check vehicle alerts
    if (vehicle_id) {
        const vehicleAlerts = alerts.filter(a => a.vehicle_id === vehicle_id && !a.resolved && a.severity === 'high');
        if (vehicleAlerts.length > 0) {
            return res.json({ allowed: false, reason: `Vehicle ${vehicle_id} has unresolved high-severity alerts.` });
        }
    }

    res.json({ allowed: true, reason: 'Checks passed.' });
});

let drowsinessEvents = {}; // Structure: { [driver_id]: [timestamp1, timestamp2, ...] }

app.post('/api/drowsiness', async (req, res) => {
    const { driver_id, score } = req.body;

    if (!supabaseConnected) return res.status(503).json({ success: false, error: 'Database disconnected' });

    // Check if driver exists
    const { data: driver } = await supabase.from('drivers').select('*').eq('id', driver_id).single();
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });

    const now = Date.now();

    // Initialize array for driver if it doesn't exist
    if (!drowsinessEvents[driver_id]) {
        drowsinessEvents[driver_id] = [];
    }

    // Add current event
    drowsinessEvents[driver_id].push(now);

    // Clean up events older than 60 seconds (60000 ms)
    const oneMinuteAgo = now - 60000;
    drowsinessEvents[driver_id] = drowsinessEvents[driver_id].filter(time => time > oneMinuteAgo);

    console.log(`👁️ Dashcam Event: Driver ${driver_id} (Events in last 60s: ${drowsinessEvents[driver_id].length})`);

    // Check if 5 events occurred within the last 60 seconds
    if (drowsinessEvents[driver_id].length >= 5) {
        // Debounce alert: Check if an unresolved HIGH severity drowsiness alert already exists
        const existingAlert = alerts.find(a =>
            a.alert_type === 'drowsiness' &&
            a.message.includes(driver_id) &&
            !a.resolved
        );

        if (!existingAlert) {
            const alert = {
                id: Date.now() + Math.random(),
                vehicle_id: 'N/A', // Hackathon dashcam tied to driver
                alert_type: 'drowsiness',
                message: `CRITICAL: Driver ${driver.name} (${driver.id}) is showing signs of severe drowsiness (5+ events/min). CALL DRIVER IMMEDIATELY.`,
                severity: 'high',
                timestamp: new Date().toISOString(),
                resolved: false
            };
            alerts.push(alert);
            syncAlertToSupabase(alert); // Sync
            console.log(`🚨 HIGH ALERT: Drowsiness limit reached for ${driver.name}! Dashboard notification triggered.`);
        }
    }

    res.json({ success: true, events_last_min: drowsinessEvents[driver_id].length });
});

// Run Soft Lock Cleanup Background Job every 30 seconds
setInterval(async () => {
    if (!supabaseConnected) return;
    try {
        const now = new Date().toISOString();
        await supabase.from('vehicles').update({ soft_lock_by: null, soft_lock_expires: null })
            .lt('soft_lock_expires', now);
        await supabase.from('drivers').update({ soft_lock_by: null, soft_lock_expires: null })
            .lt('soft_lock_expires', now);
    } catch (e) {
        console.error('Lock cleanup failed:', e.message);
    }
}, 30000);

// ═══════════════════════════════════════════════
// FINANCIAL ANALYTICS
// ═══════════════════════════════════════════════

// Serve Financial Analytics page
app.get('/financial-analytics', (req, res) => {
    res.sendFile(__dirname + '/financial_analytics.html');
});

// Get vehicles list for financial dropdowns
app.get('/api/financial/vehicles', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    try {
        const { data, error } = await supabase.from('vehicles').select('id, name, type').order('name');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get completed trips for financial linking
app.get('/api/financial/completed-trips', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    try {
        const { data, error } = await supabase.from('trips')
            .select('id, trip_number, vehicle_id, driver_id, origin_name, destination_name, estimated_distance_km, completed_at')
            .eq('status', 'Completed')
            .order('completed_at', { ascending: false })
            .limit(100);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FUEL LOGS CRUD ───

// Get all fuel logs
app.get('/api/financial/fuel-logs', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    try {
        const { data, error } = await supabase.from('fuel_logs').select('*').order('fuel_date', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create fuel log
app.post('/api/financial/fuel-logs', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Database disconnected' });
    const { vehicle_id, trip_id, fuel_liters, fuel_cost, fuel_date, notes } = req.body;

    if (!vehicle_id || !fuel_liters || !fuel_cost || !fuel_date) {
        return res.status(400).json({ error: 'vehicle_id, fuel_liters, fuel_cost, and fuel_date are required' });
    }

    // Duplicate check: same vehicle + date + similar amount
    const { data: existing } = await supabase.from('fuel_logs')
        .select('id').eq('vehicle_id', vehicle_id).eq('fuel_date', fuel_date)
        .eq('fuel_liters', fuel_liters).eq('fuel_cost', fuel_cost);
    if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'Duplicate fuel entry detected for this vehicle, date, and amount' });
    }

    try {
        const insertData = { vehicle_id, fuel_liters, fuel_cost, fuel_date };
        if (trip_id) insertData.trip_id = trip_id;
        if (notes) insertData.notes = notes;

        const { data, error } = await supabase.from('fuel_logs').insert(insertData).select();
        if (error) return res.status(500).json({ error: error.message });
        console.log(`💰 Fuel log added: ${vehicle_id} — ${fuel_liters}L / ₹${fuel_cost}`);
        res.json(data[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete fuel log
app.delete('/api/financial/fuel-logs/:id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Database disconnected' });
    try {
        const { error } = await supabase.from('fuel_logs').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FINANCIAL METRICS CRUD ───

// Get metrics for a specific vehicle
app.get('/api/financial/metrics/:vehicle_id', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Database disconnected' });
    try {
        const { data, error } = await supabase.from('financial_metrics')
            .select('*').eq('vehicle_id', req.params.vehicle_id).single();
        if (error) return res.status(404).json({ error: 'No metrics found' });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upsert financial metrics for a vehicle
app.post('/api/financial/metrics', async (req, res) => {
    if (!supabaseConnected) return res.status(503).json({ error: 'Database disconnected' });
    const { vehicle_id, acquisition_cost, revenue_per_km, insurance_monthly } = req.body;
    if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

    try {
        const { data, error } = await supabase.from('financial_metrics').upsert({
            vehicle_id,
            acquisition_cost: acquisition_cost || 0,
            revenue_per_km: revenue_per_km || 15,
            insurance_monthly: insurance_monthly || 0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'vehicle_id' }).select();
        if (error) return res.status(500).json({ error: error.message });
        console.log(`💼 Financial metrics saved for ${vehicle_id}`);
        res.json(data[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── FINANCIAL SUMMARY ───
// Returns aggregated financial data per vehicle (fuel totals, distance, cost/km, efficiency, ROI)
app.get('/api/financial/summary', async (req, res) => {
    if (!supabaseConnected) return res.json([]);
    try {
        // Compute from tables (uses odometer_km as distance fallback)
        const { data: vehicles } = await supabase.from('vehicles').select('id, name, type, odometer_km');
        const { data: fuelLogs } = await supabase.from('fuel_logs').select('vehicle_id, fuel_liters, fuel_cost');
        const { data: trips } = await supabase.from('trips')
            .select('vehicle_id, estimated_distance_km').eq('status', 'Completed');
        const { data: metrics } = await supabase.from('financial_metrics').select('*');

        const fuelByVeh = {};
        (fuelLogs || []).forEach(f => {
            if (!fuelByVeh[f.vehicle_id]) fuelByVeh[f.vehicle_id] = { liters: 0, cost: 0, entries: 0 };
            fuelByVeh[f.vehicle_id].liters += parseFloat(f.fuel_liters || 0);
            fuelByVeh[f.vehicle_id].cost += parseFloat(f.fuel_cost || 0);
            fuelByVeh[f.vehicle_id].entries++;
        });

        const tripsByVeh = {};
        (trips || []).forEach(t => {
            if (!tripsByVeh[t.vehicle_id]) tripsByVeh[t.vehicle_id] = { count: 0, distance: 0 };
            tripsByVeh[t.vehicle_id].count++;
            tripsByVeh[t.vehicle_id].distance += parseFloat(t.estimated_distance_km || 0);
        });

        const metricsByVeh = {};
        (metrics || []).forEach(m => { metricsByVeh[m.vehicle_id] = m; });

        const summary = (vehicles || []).map(v => {
            const f = fuelByVeh[v.id] || { liters: 0, cost: 0, entries: 0 };
            const t = tripsByVeh[v.id] || { count: 0, distance: 0 };
            const m = metricsByVeh[v.id] || { acquisition_cost: 0, revenue_per_km: 15 };

            // Use trip distance if available, otherwise fall back to odometer reading
            const odomKm = parseFloat(v.odometer_km || 0);
            const totalDistance = t.distance > 0 ? t.distance : (odomKm > 0 ? odomKm : 0);
            const tripCount = t.count > 0 ? t.count : (f.entries > 0 ? f.entries : 0);

            const costPerKm = totalDistance > 0 ? f.cost / totalDistance : 0;
            const efficiency = f.liters > 0 && totalDistance > 0 ? totalDistance / f.liters : 0;
            const revenue = totalDistance * (m.revenue_per_km || 15);
            const roi = m.acquisition_cost > 0 ? ((revenue - f.cost) / m.acquisition_cost * 100) : 0;

            return {
                vehicle_id: v.id,
                vehicle_name: v.name || v.id,
                vehicle_type: v.type || 'Generic',
                odometer_km: odomKm,
                total_fuel_liters: f.liters,
                total_fuel_cost: f.cost,
                fuel_entries: f.entries,
                completed_trips: tripCount,
                total_distance_km: totalDistance,
                acquisition_cost: m.acquisition_cost || 0,
                revenue_per_km: m.revenue_per_km || 15,
                cost_per_km: Math.round(costPerKm * 100) / 100,
                fuel_efficiency_kmpl: Math.round(efficiency * 100) / 100,
                estimated_revenue: Math.round(revenue * 100) / 100,
                roi_percent: Math.round(roi * 100) / 100
            };
        });

        res.json(summary);
    } catch (e) {
        console.error('Financial summary error:', e.message);
        res.status(500).json({ error: e.message });
    }
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
    console.log('  GET  /trip-dispatcher       - Trip Dispatcher UI');
    console.log('  GET  /api/drivers           - Drivers list');
    console.log('  POST /api/drivers           - Add driver');
    console.log('  GET  /api/trips             - All trips');
    console.log('  POST /api/trips             - Create trip');
    console.log('  PATCH /api/trips/:id/status - Transition trip');
    console.log('  GET  /api/locations         - Locations');
    console.log('  GET  /api/vehicles          - Vehicle Registry');
    console.log('  GET  /api/service-logs      - Maintenance Logs');
    console.log('  GET  /api/dispatcher-stats  - Dashboard stats');
    console.log('  GET  /financial-analytics   - Financial Analytics UI');
    console.log('  GET  /api/financial/*       - Financial APIs');
    console.log('═══════════════════════════════════════════════');

    // Initialize
    await testSupabaseConnection();
    initPendingCargo();

    console.log('Server ready! Waiting for vehicles...\n');
});

