-- =============================================
-- TRIP DISPATCHER PART 2 SCHEMA UPDATES
-- Run this in Supabase SQL Editor
-- =============================================

-- ─── USERS TABLE (RBAC) ───
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('Dispatcher', 'Supervisor', 'Admin', 'System')),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed User
INSERT INTO users (username, email, role) VALUES ('demo_dispatch', 'dispatch@fleet.local', 'Dispatcher') ON CONFLICT DO NOTHING;

-- ─── ADD LOCK FIELDS TO VEHICLES ───
-- Note: 'vehicles' was created in part 1 setup, adding fields here
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS soft_lock_by UUID REFERENCES users(id);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS soft_lock_expires TIMESTAMPTZ;

-- Update drivers lock_by to reference users
ALTER TABLE drivers DROP COLUMN IF EXISTS soft_lock_by;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS soft_lock_by UUID REFERENCES users(id);

-- ─── CONCURRENCY CONSTRAINTS ───
-- Layer 3 Concurrency: Prevent double-booking unconditionally at the DB level
-- A vehicle can only be on one Dispatched trip
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_trip_per_vehicle 
ON trips(vehicle_id) 
WHERE status IN ('Dispatched');

-- A driver can only be on one Dispatched trip
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_trip_per_driver 
ON trips(driver_id) 
WHERE status IN ('Dispatched');

-- ─── TRIP CARGO TABLE (Detailed items per trip) ───
CREATE TABLE IF NOT EXISTS trip_cargo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    cargo_type      TEXT NOT NULL CHECK (cargo_type IN (
                        'General','Electronics','Perishable','Hazmat',
                        'Construction','Medical','Documents','Industrial'
                    )),
    weight_kg       NUMERIC(10,2) NOT NULL CHECK (weight_kg > 0),
    actual_weight_kg NUMERIC(10,2),
    is_fragile      BOOLEAN DEFAULT FALSE,
    is_hazardous    BOOLEAN DEFAULT FALSE,
    status          TEXT DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Loaded','In Transit','Delivered','Returned')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_cargo_trip ON trip_cargo(trip_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_cargo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all trip_cargo" ON trip_cargo FOR ALL USING (true);
