-- =============================================
-- FINANCIAL ANALYTICS SCHEMA
-- Run in Supabase SQL Editor AFTER all other setup scripts
-- Adds: fuel_logs, financial_metrics
-- Does NOT modify any existing tables
-- =============================================

-- ─── FUEL LOGS TABLE ───
-- Tracks fuel entries linked to completed trips and vehicles
CREATE TABLE IF NOT EXISTS fuel_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID REFERENCES trips(id) ON DELETE SET NULL,
    vehicle_id      TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id       UUID REFERENCES drivers(id) ON DELETE SET NULL,
    fuel_liters     NUMERIC(8,2) NOT NULL CHECK (fuel_liters > 0),
    fuel_cost       NUMERIC(10,2) NOT NULL CHECK (fuel_cost > 0),
    cost_per_liter  NUMERIC(8,2) GENERATED ALWAYS AS (fuel_cost / NULLIF(fuel_liters, 0)) STORED,
    odometer_at     NUMERIC(12,2),
    fuel_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_logs_vehicle ON fuel_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip ON fuel_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_date ON fuel_logs(fuel_date DESC);

-- ─── FINANCIAL METRICS TABLE ───
-- Stores per-vehicle financial parameters (acquisition cost, revenue, etc.)
CREATE TABLE IF NOT EXISTS financial_metrics (
    vehicle_id          TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    acquisition_cost    NUMERIC(12,2) DEFAULT 0,
    revenue_per_km      NUMERIC(8,2) DEFAULT 15.00,
    insurance_monthly   NUMERIC(10,2) DEFAULT 0,
    depreciation_yearly NUMERIC(10,2) DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS POLICIES ───
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all fuel_logs" ON fuel_logs FOR ALL USING (true);
CREATE POLICY "Allow all financial_metrics" ON financial_metrics FOR ALL USING (true);

-- ─── HELPER VIEW: Vehicle Financial Summary ───
-- Aggregates fuel, maintenance, and trip data per vehicle
CREATE OR REPLACE VIEW vehicle_financial_summary AS
SELECT
    v.id AS vehicle_id,
    v.name AS vehicle_name,
    v.type AS vehicle_type,
    COALESCE(v.odometer_km, 0) AS odometer_km,
    -- Fuel totals
    COALESCE(f.total_fuel_liters, 0) AS total_fuel_liters,
    COALESCE(f.total_fuel_cost, 0) AS total_fuel_cost,
    COALESCE(f.fuel_entries, 0) AS fuel_entries,
    -- Trip totals
    COALESCE(t.completed_trips, 0) AS completed_trips,
    COALESCE(t.total_distance_km, 0) AS total_distance_km,
    -- Maintenance totals
    COALESCE(m.total_service_logs, 0) AS total_service_logs,
    -- Financial metrics
    COALESCE(fm.acquisition_cost, 0) AS acquisition_cost,
    COALESCE(fm.revenue_per_km, 15.00) AS revenue_per_km,
    -- Calculated fields
    CASE WHEN COALESCE(t.total_distance_km, 0) > 0
         THEN ROUND(COALESCE(f.total_fuel_cost, 0) / t.total_distance_km, 2)
         ELSE 0 END AS cost_per_km,
    CASE WHEN COALESCE(f.total_fuel_liters, 0) > 0
         THEN ROUND(COALESCE(t.total_distance_km, 0) / f.total_fuel_liters, 2)
         ELSE 0 END AS fuel_efficiency_kmpl,
    -- Revenue estimate
    ROUND(COALESCE(t.total_distance_km, 0) * COALESCE(fm.revenue_per_km, 15.00), 2) AS estimated_revenue,
    -- ROI
    CASE WHEN COALESCE(fm.acquisition_cost, 0) > 0
         THEN ROUND(
            (COALESCE(t.total_distance_km, 0) * COALESCE(fm.revenue_per_km, 15.00) - COALESCE(f.total_fuel_cost, 0))
            / fm.acquisition_cost * 100, 2)
         ELSE 0 END AS roi_percent
FROM vehicles v
LEFT JOIN (
    SELECT vehicle_id,
           SUM(fuel_liters) AS total_fuel_liters,
           SUM(fuel_cost) AS total_fuel_cost,
           COUNT(*) AS fuel_entries
    FROM fuel_logs GROUP BY vehicle_id
) f ON f.vehicle_id = v.id
LEFT JOIN (
    SELECT vehicle_id,
           COUNT(*) AS completed_trips,
           COALESCE(SUM(estimated_distance_km), 0) AS total_distance_km
    FROM trips WHERE status = 'Completed' GROUP BY vehicle_id
) t ON t.vehicle_id = v.id
LEFT JOIN (
    SELECT vehicle_id, COUNT(*) AS total_service_logs
    FROM service_logs GROUP BY vehicle_id
) m ON m.vehicle_id = v.id
LEFT JOIN financial_metrics fm ON fm.vehicle_id = v.id;
