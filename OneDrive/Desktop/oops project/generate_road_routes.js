// Generate realistic road-based routes using OpenStreetMap OSRM API
const https = require('https');
const fs = require('fs');

// OSRM API endpoint (free public server)
const OSRM_SERVER = 'router.project-osrm.org';

// Original waypoints from routes.json
const originalRoutes = {
    "T1": {
        "name": "Industrial Route - Naroda to GIDC",
        "waypoints": [
            { "lat": 23.0670, "lon": 72.6310, "name": "Naroda Industrial Area" },
            { "lat": 23.0650, "lon": 72.6200, "name": "Naroda Road" },
            { "lat": 23.0580, "lon": 72.6100, "name": "Kubernagar" },
            { "lat": 23.0500, "lon": 72.6000, "name": "Nikol" },
            { "lat": 23.0400, "lon": 72.5900, "name": "CTM" },
            { "lat": 23.0300, "lon": 72.5800, "name": "Vastral" },
            { "lat": 23.0200, "lon": 72.5700, "name": "Odhav" },
            { "lat": 23.0100, "lon": 72.5650, "name": "GIDC Industrial Estate" }
        ],
        "speed_limit": 60,
        "cargo_type": "Industrial Goods"
    },
    "V1": {
        "name": "Commercial Route - CG Road to SG Highway",
        "waypoints": [
            { "lat": 23.0300, "lon": 72.5500, "name": "CG Road Business District" },
            { "lat": 23.0280, "lon": 72.5520, "name": "Mithakhali" },
            { "lat": 23.0250, "lon": 72.5550, "name": "Navrangpura" },
            { "lat": 23.0200, "lon": 72.5600, "name": "Paldi" },
            { "lat": 23.0150, "lon": 72.5650, "name": "Satellite" },
            { "lat": 23.0100, "lon": 72.5700, "name": "Bodakdev" },
            { "lat": 23.0050, "lon": 72.5750, "name": "SG Highway North" },
            { "lat": 23.0000, "lon": 72.5800, "name": "Prahlad Nagar" }
        ],
        "speed_limit": 50,
        "cargo_type": "Electronics"
    },
    "C1": {
        "name": "Express Delivery - Railway Station to Airport",
        "waypoints": [
            { "lat": 23.0225, "lon": 72.5714, "name": "Ahmedabad Railway Station" },
            { "lat": 23.0250, "lon": 72.5650, "name": "Shahpur" },
            { "lat": 23.0300, "lon": 72.5600, "name": "Ellis Bridge" },
            { "lat": 23.0400, "lon": 72.5500, "name": "Ashram Road" },
            { "lat": 23.0500, "lon": 72.5400, "name": "Maninagar" },
            { "lat": 23.0600, "lon": 72.5300, "name": "Vatva" },
            { "lat": 23.0650, "lon": 72.5200, "name": "Ramol" },
            { "lat": 23.0700, "lon": 72.5100, "name": "Sardar Vallabhbhai Patel International Airport" }
        ],
        "speed_limit": 70,
        "cargo_type": "Documents"
    }
};

// Get route from OSRM API
function getRoute(waypoints, callback) {
    const coordinates = waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';');
    const path = `/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

    const options = {
        hostname: OSRM_SERVER,
        port: 443,
        path: path,
        method: 'GET'
    };

    const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const result = JSON.parse(data);
                if (result.code === 'Ok' && result.routes && result.routes.length > 0) {
                    callback(null, result.routes[0]);
                } else {
                    callback(new Error('No route found'));
                }
            } catch (err) {
                callback(err);
            }
        });
    });

    req.on('error', (error) => {
        callback(error);
    });

    req.end();
}

// Process all routes
async function generateAllRoutes() {
    const roadBasedRoutes = {};

    for (const [vehicleId, route] of Object.entries(originalRoutes)) {
        console.log(`\nGenerating road-based route for ${vehicleId}...`);

        await new Promise((resolve, reject) => {
            getRoute(route.waypoints, (err, routeData) => {
                if (err) {
                    console.error(`Error for ${vehicleId}:`, err.message);
                    // Fallback to original waypoints if API fails
                    roadBasedRoutes[vehicleId] = {
                        name: route.name,
                        waypoints: route.waypoints,
                        cyclic: true,
                        speed_limit: route.speed_limit,
                        cargo_type: route.cargo_type,
                        road_based: false
                    };
                    resolve();
                    return;
                }

                // Extract detailed waypoints from the route geometry
                const geometry = routeData.geometry.coordinates;
                const detailedWaypoints = [];

                // Keep original waypoint names at their positions
                let wpIndex = 0;
                for (let i = 0; i < geometry.length; i++) {
                    const [lon, lat] = geometry[i];

                    // Check if this point is close to an original waypoint
                    const originalWp = route.waypoints[wpIndex];
                    const isNamedWaypoint = originalWp &&
                        Math.abs(lat - originalWp.lat) < 0.005 &&
                        Math.abs(lon - originalWp.lon) < 0.005;

                    detailedWaypoints.push({
                        lat: lat,
                        lon: lon,
                        name: isNamedWaypoint ? originalWp.name : `Point ${i + 1}`
                    });

                    if (isNamedWaypoint && wpIndex < route.waypoints.length - 1) {
                        wpIndex++;
                    }
                }

                console.log(`✓ Generated ${detailedWaypoints.length} road points for ${vehicleId}`);
                console.log(`  Route distance: ${(routeData.distance / 1000).toFixed(2)} km`);
                console.log(`  Estimated time: ${(routeData.duration / 60).toFixed(1)} min`);

                roadBasedRoutes[vehicleId] = {
                    name: route.name,
                    waypoints: detailedWaypoints,
                    cyclic: true,
                    speed_limit: route.speed_limit,
                    cargo_type: route.cargo_type,
                    road_based: true,
                    total_distance_km: routeData.distance / 1000,
                    estimated_duration_min: routeData.duration / 60
                };

                resolve();
            });
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Save to file
    const outputPath = 'routes_road_based.json';
    fs.writeFileSync(outputPath, JSON.stringify(roadBasedRoutes, null, 2));
    console.log(`\n✓ Road-based routes saved to ${outputPath}`);
    console.log('\nSummary:');
    for (const [id, route] of Object.entries(roadBasedRoutes)) {
        console.log(`  ${id}: ${route.waypoints.length} waypoints, ${route.total_distance_km?.toFixed(1) || '?'} km`);
    }
}

// Run the generator
console.log('='.repeat(60));
console.log('Generating Road-Based Routes using OpenStreetMap');
console.log('='.repeat(60));

generateAllRoutes().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
