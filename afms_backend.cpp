#include "json.hpp"
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>
#include <windows.h>


using json = nlohmann::json;
using namespace std;

// Waypoint structure
struct Waypoint {
  double lat, lon;
  string name;
};

// Route structure
struct Route {
  string name;
  vector<Waypoint> waypoints;
  bool cyclic;
  double speed_limit;
  string cargo_type;
};

class Vehicle {
public:
  string id, name, cargo;
  double lat, lon, speed;
  Route route;
  int current_waypoint_idx;
  double total_distance;
  string status;

  Vehicle(string id_, string name_, string cargo_, Route route_)
      : id(id_), name(name_), cargo(cargo_), route(route_),
        current_waypoint_idx(0), total_distance(0.0), speed(0.0),
        status("Active") {
    // Start at first waypoint
    if (!route.waypoints.empty()) {
      lat = route.waypoints[0].lat;
      lon = route.waypoints[0].lon;
    }
  }

  virtual ~Vehicle() {}

  // Calculate distance between two points (simplified)
  double calculateDistance(double lat1, double lon1, double lat2,
                           double lon2) const {
    double dlat = lat2 - lat1;
    double dlon = lon2 - lon1;
    return sqrt(dlat * dlat + dlon * dlon);
  }

  virtual void move() {
    if (route.waypoints.empty())
      return;

    // Get next waypoint
    int next_idx = (current_waypoint_idx + 1) % route.waypoints.size();
    Waypoint &next = route.waypoints[next_idx];

    // Calculate direction to next waypoint
    double dx = next.lon - lon;
    double dy = next.lat - lat;
    double distance = sqrt(dx * dx + dy * dy);

    // If we're close to the waypoint, move to next one
    if (distance < 0.002) {
      current_waypoint_idx = next_idx;
      cout << "[" << id << "] Reached waypoint: " << next.name << endl;

      // If completed full route and not cyclic, mark as idle
      if (!route.cyclic && current_waypoint_idx == 0) {
        status = "Idle";
        speed = 0.0;
        return;
      }
    }

    // Move towards next waypoint
    double step_size = getStepSize();
    if (distance > 0) {
      double move_lat = (dy / distance) * step_size;
      double move_lon = (dx / distance) * step_size;

      lat += move_lat;
      lon += move_lon;

      // Calculate speed (km/h) - approximate
      total_distance +=
          calculateDistance(lat - move_lat, lon - move_lon, lat, lon) *
          111.0; // deg to km

      // Set realistic speed with some variation
      double base_speed = getBaseSpeed();
      speed = base_speed + (rand() % 10 - 5); // +/- 5 km/h variation
      speed = max(
          0.0, min(speed, route.speed_limit + 10)); // Cap at speed limit + 10
    }

    status = "Active";
  }

  virtual double getStepSize() { return 0.001; }
  virtual double getBaseSpeed() { return 40.0; }
  virtual string type() const { return "Generic"; }

  string getCurrentDestination() const {
    if (route.waypoints.empty())
      return "Unknown";
    int next_idx = (current_waypoint_idx + 1) % route.waypoints.size();
    return route.waypoints[next_idx].name;
  }

  int getETA() const {
    if (route.waypoints.empty() || speed == 0)
      return 0;
    int next_idx = (current_waypoint_idx + 1) % route.waypoints.size();
    double dist = calculateDistance(lat, lon, route.waypoints[next_idx].lat,
                                    route.waypoints[next_idx].lon) *
                  111.0;
    return (int)(dist / speed * 60.0); // minutes
  }

  virtual json toJson() const {
    return {{"id", id},
            {"name", name},
            {"lat", lat},
            {"lon", lon},
            {"speed", speed},
            {"status", status},
            {"content", cargo},
            {"type", type()},
            {"region", getRegion()},
            {"route_name", route.name},
            {"current_waypoint", current_waypoint_idx},
            {"total_waypoints", (int)route.waypoints.size()},
            {"distance_traveled", total_distance},
            {"eta_minutes", getETA()},
            {"destination", getCurrentDestination()},
            {"speed_limit", route.speed_limit}};
  }

  virtual string getRegion() const {
    // Assign region based on vehicle type
    if (type() == "Truck")
      return "East";
    if (type() == "Van")
      return "West";
    if (type() == "Car")
      return "Central";
    return "North";
  }
};

class Truck : public Vehicle {
public:
  Truck(string id_, Route route_)
      : Vehicle(id_, "Truck", route_.cargo_type, route_) {}
  double getStepSize() override { return 0.0008; }
  double getBaseSpeed() override { return 45.0; }
  string type() const override { return "Truck"; }
};

class Van : public Vehicle {
public:
  Van(string id_, Route route_)
      : Vehicle(id_, "Van", route_.cargo_type, route_) {}
  double getStepSize() override { return 0.0012; }
  double getBaseSpeed() override { return 40.0; }
  string type() const override { return "Van"; }
};

class Car : public Vehicle {
public:
  Car(string id_, Route route_)
      : Vehicle(id_, "Car", route_.cargo_type, route_) {}
  double getStepSize() override { return 0.0015; }
  double getBaseSpeed() override { return 50.0; }
  string type() const override { return "Car"; }
};

string timestampNow() {
  time_t t = time(nullptr);
  char buf[64];
  strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", localtime(&t));
  return string(buf);
}

// Load routes from JSON file
Route loadRoute(const json &routeData) {
  Route r;
  r.name = routeData["name"];
  r.cyclic = routeData["cyclic"];
  r.speed_limit = routeData["speed_limit"];
  r.cargo_type = routeData["cargo_type"];

  for (auto &wp : routeData["waypoints"]) {
    Waypoint w;
    w.lat = wp["lat"];
    w.lon = wp["lon"];
    w.name = wp["name"];
    r.waypoints.push_back(w);
  }

  return r;
}

// Use curl.exe to post telemetry to Node.js relay
bool postTelemetry(const json &js, const string &url) {
  string tmpFile = "telemetry.json";
  ofstream fout(tmpFile);
  fout << js.dump();
  fout.close();
  string cmd = "curl.exe -X POST \"" + url +
               "\" -H \"Content-Type: application/json\" -d @" + tmpFile +
               " >nul 2>&1";
  int res = system(cmd.c_str());
  remove(tmpFile.c_str());
  return res == 0;
}

int main() {
  srand(time(0));
  string guiRelay = "http://localhost:5500/ingest";

  // Load routes from JSON
  ifstream routeFile("routes.json");
  if (!routeFile.is_open()) {
    cerr << "Error: Could not open routes.json" << endl;
    return 1;
  }

  json routesJson;
  routeFile >> routesJson;
  routeFile.close();

  // Create fleet with routes
  vector<unique_ptr<Vehicle>> fleet;

  cout << "Loading routes..." << endl;
  Route t1Route = loadRoute(routesJson["T1"]);
  Route v1Route = loadRoute(routesJson["V1"]);
  Route c1Route = loadRoute(routesJson["C1"]);

  fleet.emplace_back(std::unique_ptr<Truck>(new Truck("T1", t1Route)));
  fleet.emplace_back(std::unique_ptr<Van>(new Van("V1", v1Route)));
  fleet.emplace_back(std::unique_ptr<Car>(new Car("C1", c1Route)));

  cout << "Fleet initialized with " << fleet.size() << " vehicles" << endl;
  cout << "Press Ctrl+C to stop..." << endl;

  while (true) {
    std::ofstream logf("afms_log.txt", std::ios::app);
    for (auto &v : fleet) {
      v->move();
      auto js = v->toJson();
      postTelemetry(js, guiRelay);
      logf << "[" << timestampNow() << "] " << v->type() << " " << js["id"]
           << " at " << js["lat"] << "," << js["lon"]
           << " speed=" << js["speed"] << " km/h"
           << " -> " << js["destination"] << "\n";
    }
    logf.flush();
    logf.close();
    Sleep(5000); // 5 seconds
  }
  return 0;
}
