-- =============================================
-- VEHICLE REGISTRY & MAINTENANCE LOGS
-- SUPABASE SCHEMA SETUP
-- =============================================

-- ─── 1. EXTEND VEHICLES TABLE ───
-- Add required fields for the new Vehicle Registry
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_plate TEXT UNIQUE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS max_capacity_kg NUMERIC(10,2) DEFAULT 2000.00;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS odometer_km NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registry_status TEXT DEFAULT 'Available'
    CHECK (registry_status IN ('Available', 'Assigned', 'In Shop', 'Out of Service'));

-- Note: The 'status' column already exists in vehicles from Part 1. 
-- For backward compatibility with the C++ backend and live map, we'll keep 'status' for live tracking (Idle, Moving, Offline)
-- and use 'registry_status' for the permanent registry state.

-- ─── 2. SERVICE LOGS TABLE ───
CREATE TABLE IF NOT EXISTS service_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    service_type    TEXT NOT NULL CHECK (service_type IN ('Preventative', 'Repair')),
    start_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date        TIMESTAMPTZ,
    notes           TEXT,
    status          TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_logs_vehicle ON service_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_logs_status ON service_logs(status);

-- ─── 3. RLS POLICIES ───
ALTER TABLE service_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all service_logs" ON service_logs FOR ALL USING (true);

-- ─── 4. TRIGGERS FOR AUTOMATIC STATUS UPDATES ───

-- Trigger function to update vehicle registry_status when a service log changes
CREATE OR REPLACE FUNCTION update_vehicle_status_on_service()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new log is Opened, or an existing log is updated to Open
    IF (TG_OP = 'INSERT' AND NEW.status = 'Open') OR (TG_OP = 'UPDATE' AND NEW.status = 'Open' AND OLD.status != 'Open') THEN
        UPDATE vehicles SET registry_status = 'In Shop' WHERE id = NEW.vehicle_id;
    END IF;

    -- When a log is Closed
    IF TG_OP = 'UPDATE' AND NEW.status = 'Closed' AND OLD.status = 'Open' THEN
        -- Check if there are ANY OTHER open logs for this vehicle
        IF NOT EXISTS (SELECT 1 FROM service_logs WHERE vehicle_id = NEW.vehicle_id AND status = 'Open' AND id != NEW.id) THEN
            -- Only set back to Available if no other logs are open
            -- (Safety check: don't change if it was manually put Out of Service)
            UPDATE vehicles SET registry_status = 'Available' WHERE id = NEW.vehicle_id AND registry_status = 'In Shop';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to service_logs
DROP TRIGGER IF EXISTS trigger_service_log_status_update ON service_logs;
CREATE TRIGGER trigger_service_log_status_update
AFTER INSERT OR UPDATE ON service_logs
FOR EACH ROW
EXECUTE FUNCTION update_vehicle_status_on_service();

-- ─── 5. TRIGGER FOR ODOMETER VALIDATION ───
-- Ensure odometer never decreases
CREATE OR REPLACE FUNCTION check_odometer_increase()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.odometer_km < OLD.odometer_km THEN
        RAISE EXCEPTION 'Odometer value cannot decrease. Current: %, Attempted: %', OLD.odometer_km, NEW.odometer_km;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_odometer ON vehicles;
CREATE TRIGGER trigger_check_odometer
BEFORE UPDATE OF odometer_km ON vehicles
FOR EACH ROW
EXECUTE FUNCTION check_odometer_increase();
