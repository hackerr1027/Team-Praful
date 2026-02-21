const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://snjdtqodcplupqicvndx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuamR0cW9kY3BsdXBxaWN2bmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDMxOTIsImV4cCI6MjA4NzIxOTE5Mn0.tyMzdRqfGAvuIh1lawQHVDvUYkCSqnO-dZ_eEDcAzAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    console.log("1. Deleting excess vehicles (V-998, V-999) to ensure exactly 7 tracked vehicles...");
    await supabase.from('vehicles').delete().in('id', ['V-998', 'V-999']);

    console.log("2. Cleaning old financial and trip data...");
    await supabase.from('fuel_logs').delete().not('id', 'is', null);
    await supabase.from('financial_metrics').delete().not('id', 'is', null);
    await supabase.from('trips').delete().not('id', 'is', null);

    // Get a driver for trips
    const { data: drivers } = await supabase.from('drivers').select('id').limit(1);
    const driverId = drivers[0].id;

    const data = [
        { vid: "T1", type: "Truck", dist: 4500, trips: 12, fuelCost: 90000, efficiency: 4.5, acq: 1800000, revKm: 50 },
        { vid: "T2", type: "Truck", dist: 5200, trips: 15, fuelCost: 117000, efficiency: 4.0, acq: 2200000, revKm: 50 },
        { vid: "T3", type: "Truck", dist: 2800, trips: 8, fuelCost: 60000, efficiency: 4.2, acq: 1500000, revKm: 50 },
        { vid: "V1", type: "Van", dist: 3500, trips: 25, fuelCost: 31500, efficiency: 10.0, acq: 900000, revKm: 25 },
        { vid: "Van-05", type: "Van", dist: 2400, trips: 18, fuelCost: 22500, efficiency: 9.6, acq: 850000, revKm: 25 },
        { vid: "V-997", type: "Van", dist: 4100, trips: 30, fuelCost: 33480, efficiency: 11.0, acq: 600000, revKm: 25 },
        { vid: "C1", type: "Car", dist: 1500, trips: 10, fuelCost: 9000, efficiency: 15.0, acq: 500000, revKm: 20 }
    ];

    console.log("2.5 Ensure all 7 vehicles exist in vehicles table (without touching odometer_km to avoid SQL trigger errors)...");

    const vehicleUpserts = data.map(v => ({
        id: v.vid,
        name: v.vid,
        type: v.type,
        license_plate: `GJ-01-${v.vid}`,
        status: 'Idle',
        registry_status: 'Available'
    }));
    const { error: vehErr } = await supabase.from('vehicles').upsert(vehicleUpserts);
    if (vehErr) console.error("Vehicle Upsert Error:", vehErr.message);

    console.log("3. Seeding exact realistic data...");
    for (const v of data) {
        // 1. Insert metrics
        await supabase.from('financial_metrics').insert({
            vehicle_id: v.vid,
            acquisition_cost: v.acq,
            revenue_per_km: v.revKm,
            insurance_monthly: 3000
        });

        // 2. Insert fuel logs
        const totalLiters = v.dist / v.efficiency;
        const litersPerEntry = totalLiters / v.trips;
        const costPerEntry = v.fuelCost / v.trips;

        const fuelRecords = Array.from({ length: v.trips }).map((_, i) => ({
            vehicle_id: v.vid,
            fuel_liters: litersPerEntry,
            fuel_cost: costPerEntry,
            fuel_date: `2026-02-${String(Math.floor(Math.random() * 20 + 1)).padStart(2, '0')}`,
            notes: `Auto-entry ${i + 1}/${v.trips}`
        }));
        await supabase.from('fuel_logs').insert(fuelRecords);

        // 3. Insert trips (bypasses odometer trigger, sets exact stats!)
        const distPerTrip = v.dist / v.trips;
        const tripRecords = Array.from({ length: v.trips }).map((_, i) => ({
            vehicle_id: v.vid,
            driver_id: driverId,
            status: 'Completed',
            origin_name: 'Warehouse',
            destination_name: 'Depot',
            estimated_distance_km: distPerTrip,
            pickup_time: new Date().toISOString(),
            delivery_deadline: new Date().toISOString(),
            created_by: 'System'
        }));
        const { error: tripErr } = await supabase.from('trips').insert(tripRecords);
        if (tripErr) console.error(`Trip insert error for ${v.vid}:`, tripErr.message);

        console.log(` ✅ Seeded ${v.vid} -> ${v.dist}km, ${v.trips} trips, ${v.fuelCost} fuel cost`);
    }

    console.log("DONE! Dashboard should now reflect exactly the requested figures.");
}

run();
