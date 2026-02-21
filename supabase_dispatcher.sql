-- =============================================
-- TRIP DISPATCHER SCHEMA — Run in Supabase SQL Editor
-- Adds: drivers, trips, trip_cargo, locations, audit_logs
-- =============================================

-- ─── DRIVERS TABLE (comprehensive) ───
CREATE TABLE IF NOT EXISTS drivers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    license_number  TEXT UNIQUE NOT NULL,
    license_class   TEXT NOT NULL DEFAULT 'Medium'
                    CHECK (license_class IN ('Light', 'Medium', 'Heavy', 'Hazmat')),
    license_expiry  DATE,
    status          TEXT NOT NULL DEFAULT 'Available'
                    CHECK (status IN ('Available', 'On Trip', 'Off Duty', 'Suspended', 'Reserved')),
    region          TEXT DEFAULT 'Central',
    shift_start     TIME NOT NULL DEFAULT '08:00',
    shift_end       TIME NOT NULL DEFAULT '20:00',
    max_daily_hours NUMERIC(4,1) DEFAULT 10.0,
    hours_driven_today NUMERIC(4,1) DEFAULT 0.0,
    total_hours_this_week NUMERIC(5,1) DEFAULT 0.0,
    total_hours_this_month NUMERIC(6,1) DEFAULT 0.0,
    total_trips_completed INT DEFAULT 0,
    total_distance_km NUMERIC(12,2) DEFAULT 0.0,
    rating          NUMERIC(3,2) DEFAULT 5.00 CHECK (rating >= 0 AND rating <= 5),
    date_of_joining DATE DEFAULT CURRENT_DATE,
    emergency_contact TEXT,
    blood_group     TEXT,
    address         TEXT,
    profile_photo_url TEXT,
    notes           TEXT,
    soft_lock_by    UUID,
    soft_lock_expires TIMESTAMPTZ,
    last_trip_ended_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_license_class ON drivers(license_class);
CREATE INDEX IF NOT EXISTS idx_drivers_region ON drivers(region);
CREATE INDEX IF NOT EXISTS idx_drivers_soft_lock ON drivers(soft_lock_expires) WHERE soft_lock_expires IS NOT NULL;

-- ─── LOCATIONS TABLE ───
CREATE TABLE IF NOT EXISTS locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    address     TEXT,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    region      TEXT DEFAULT 'Central',
    type        TEXT DEFAULT 'Depot' CHECK (type IN ('Depot', 'Warehouse', 'Customer', 'Hub', 'Port', 'Factory')),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_region ON locations(region);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);

-- ─── TRIPS TABLE ───
CREATE TABLE IF NOT EXISTS trips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number         SERIAL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft', 'Dispatched', 'Completed', 'Cancelled')),
    vehicle_id          TEXT NOT NULL,
    driver_id           UUID REFERENCES drivers(id),
    origin_name         TEXT NOT NULL,
    destination_name    TEXT NOT NULL,
    origin_lat          DOUBLE PRECISION,
    origin_lon          DOUBLE PRECISION,
    destination_lat     DOUBLE PRECISION,
    destination_lon     DOUBLE PRECISION,
    pickup_time         TIMESTAMPTZ NOT NULL,
    delivery_deadline   TIMESTAMPTZ NOT NULL,
    actual_departure    TIMESTAMPTZ,
    actual_arrival      TIMESTAMPTZ,
    estimated_distance_km NUMERIC(10,2),
    estimated_duration_min INT,
    cargo_description   TEXT,
    cargo_type          TEXT DEFAULT 'General',
    cargo_weight_kg     NUMERIC(10,2) NOT NULL DEFAULT 0,
    cancellation_reason TEXT,
    replacement_for     UUID REFERENCES trips(id),
    warnings_acknowledged JSONB DEFAULT '[]'::jsonb,
    created_by          TEXT DEFAULT 'Dispatcher',
    dispatched_by       TEXT,
    dispatched_at       TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    version             INT DEFAULT 1,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_pickup ON trips(pickup_time);
CREATE INDEX IF NOT EXISTS idx_trips_active_vehicle ON trips(vehicle_id) WHERE status IN ('Draft', 'Dispatched');
CREATE INDEX IF NOT EXISTS idx_trips_active_driver ON trips(driver_id) WHERE status IN ('Draft', 'Dispatched');

-- ─── AUDIT LOGS TABLE ───
CREATE TABLE IF NOT EXISTS dispatch_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    action          TEXT NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    performed_by    TEXT DEFAULT 'Dispatcher',
    reason          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_entity ON dispatch_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_audit_time ON dispatch_audit_logs(created_at DESC);

-- ─── RLS POLICIES ───
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all drivers" ON drivers FOR ALL USING (true);
CREATE POLICY "Allow all locations" ON locations FOR ALL USING (true);
CREATE POLICY "Allow all trips" ON trips FOR ALL USING (true);
CREATE POLICY "Allow all dispatch_audit" ON dispatch_audit_logs FOR ALL USING (true);

-- ─── ENABLE REALTIME ───
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE trips;

-- ─── SEED LOCATIONS (Ahmedabad) ───
INSERT INTO locations (name, address, lat, lon, region, type) VALUES
    ('Naroda GIDC', 'Naroda Industrial Area, Ahmedabad', 23.0700, 72.6600, 'North', 'Factory'),
    ('SG Highway Hub', 'SG Highway, Ahmedabad', 23.0300, 72.5100, 'West', 'Hub'),
    ('Airport Cargo', 'Sardar Patel Intl Airport, Ahmedabad', 23.0730, 72.6265, 'North', 'Depot'),
    ('Odhav GIDC', 'Odhav Industrial Estate', 22.9950, 72.6670, 'East', 'Factory'),
    ('Satellite Depot', 'Satellite Road, Ahmedabad', 23.0150, 72.5250, 'West', 'Depot'),
    ('Maninagar Warehouse', 'Maninagar, Ahmedabad', 22.9980, 72.6020, 'Central', 'Warehouse'),
    ('Bopal Logistics', 'Bopal, Ahmedabad', 23.0280, 72.4670, 'West', 'Warehouse'),
    ('Chandkheda Hub', 'Chandkheda, Ahmedabad', 23.1080, 72.5870, 'North', 'Hub'),
    ('Vatva Industrial', 'Vatva GIDC, Ahmedabad', 22.9570, 72.6430, 'South', 'Factory'),
    ('Gota Distribution', 'Gota, Ahmedabad', 23.1030, 72.5430, 'North', 'Depot'),
    ('Ashram Road Office', 'Ashram Road, Ahmedabad', 23.0350, 72.5680, 'Central', 'Customer'),
    ('Prahlad Nagar Center', 'Prahlad Nagar, Ahmedabad', 23.0130, 72.5100, 'West', 'Customer')
ON CONFLICT DO NOTHING;
