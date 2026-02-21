-- =============================================
-- Supabase Schema: Fleet Management System
-- Run this in Supabase SQL Editor
-- =============================================

-- Vehicles table (live state, upserted on each telemetry tick)
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT NOT NULL DEFAULT 'Generic',
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    speed_limit DOUBLE PRECISION DEFAULT 60,
    status TEXT DEFAULT 'Idle',
    region TEXT DEFAULT 'Central',
    destination TEXT,
    cargo TEXT,
    route_name TEXT,
    distance_traveled DOUBLE PRECISION DEFAULT 0,
    current_waypoint INT DEFAULT 0,
    total_waypoints INT DEFAULT 0,
    eta_minutes INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    message TEXT,
    severity TEXT DEFAULT 'low',
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pending cargo table
CREATE TABLE IF NOT EXISTS cargo (
    id TEXT PRIMARY KEY,
    type TEXT,
    destination TEXT,
    weight_kg INT DEFAULT 0,
    priority TEXT DEFAULT 'Low',
    status TEXT DEFAULT 'Pending',
    assigned_vehicle TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telemetry history (time-series data)
CREATE TABLE IF NOT EXISTS telemetry (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    status TEXT,
    destination TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle ON telemetry(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_vehicle ON alerts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_cargo_status ON cargo(status);

-- Enable Row Level Security (open for now, tighten later)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;

-- Allow anon access (for dashboard reads)
CREATE POLICY "Allow read vehicles" ON vehicles FOR SELECT USING (true);
CREATE POLICY "Allow all vehicles" ON vehicles FOR ALL USING (true);
CREATE POLICY "Allow read alerts" ON alerts FOR SELECT USING (true);
CREATE POLICY "Allow all alerts" ON alerts FOR ALL USING (true);
CREATE POLICY "Allow read cargo" ON cargo FOR SELECT USING (true);
CREATE POLICY "Allow all cargo" ON cargo FOR ALL USING (true);
CREATE POLICY "Allow read telemetry" ON telemetry FOR SELECT USING (true);
CREATE POLICY "Allow all telemetry" ON telemetry FOR ALL USING (true);

-- Enable Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
