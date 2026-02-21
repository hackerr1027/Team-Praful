# Vehicle Registry + Maintenance Integration

## 1. Overview
This document outlines the design for integrating a complete Vehicle Registry (Asset Management) and Maintenance Service Logging system into the existing Fleet Dispatch System. The primary goal is to establish a single source of truth for all vehicles, ensuring operational safety, automated lifecycle tracking, and clean integration. The dispatcher logic is protected by ensuring that unavailable assets and overweight cargo are explicitly blocked at the initial point of interaction.

## 2. Vehicle Registry Design

### Fields
Each vehicle entity will record the following core data points:
- **Vehicle ID:** Unique UUID for database relation
- **Name / Model:** E.g., "Ford Transit 250", "Volvo VNL Heavy"
- **License Plate (Unique ID):** String identifier, must be globally unique
- **Max Load Capacity:** Numeric (kg) defining the structural rating
- **Odometer:** Numeric (km/miles) tracking total distance traveled
- **Status:** The current operational toggle (see Statuses)

### Statuses
The vehicle lifecycle is governed by four explicit states:
- **Available:** Vehicle is idle, functional, and ready for dispatch.
- **Assigned:** Vehicle is currently allocated to an active, ongoing trip.
- **In Shop:** Vehicle is undergoing preventative or reactive maintenance.
- **Out of Service:** Vehicle is permanently retired from the fleet or decommissioned.

### Validations
To enforce data integrity, the Registry applies strict validation rules:
- **Unique License Plate Enforcement:** The database and API must prevent the creation or update of a vehicle if the license plate already exists.
- **Odometer Update Rule:** An odometer value can only be appended over time; any API payload attempting to set the odometer to a value lower than its current historical maximum will be rejected.

### Dispatcher Filtering Logic
The Dispatcher trip creation interface selectively filters the vehicle pool to present only actionable choices.
- **Included Statuses:** Only vehicles with an `Available` status are shown.
- **Excluded Statuses:** Vehicles marked as `Assigned`, `In Shop`, or `Out of Service` are hidden from the UI entirely, preventing accidental scheduling.

## 3. Maintenance & Service Log Design

### Fields
A Service Log is created when a vehicle requires maintenance. It must include:
- **Log ID:** Unique identifier for the service event
- **Vehicle ID:** Foreign key linking to the specific vehicle
- **Service Type:** Categorical toggle ("Preventative" or "Repair")
- **Start Date:** Timestamp of when service began
- **End Date:** Timestamp of when service concluded (null if open)
- **Notes:** Free-text field for mechanic's findings
- **Status:** Boolean or categorical status ("Open" or "Closed")

### Automatic Status Updates
The creation and resolution of a Service Log drives vehicle status updates through an event-driven mechanism:
- **Opening a Log:** When a log is initialized with the "Open" status, the system must forcefully update the associated vehicle's status to `In Shop`.
- **Closing a Log:** When a log is finalized (marked "Closed" and given an End Date), the system evaluates the vehicle.

### Re-entry Logic
When a service log is closed, the system will automatically update the vehicle status back to `Available`, allowing it to reappear in the Dispatcher pool. This assumes no overarching fleet-wide holds prevent its re-entry.

## 4. Dispatcher Integration Rules

### Selection Filtering
When a dispatcher lands on the Trip Creation interface, a data-load event pulls the vehicle registry. The backend API applies the exclusion logic:
- `SELECT * FROM vehicles WHERE status = 'Available'`
- Vehicles that are `In Shop`, `Out of Service`, or currently `Assigned` are never transmitted to the frontend pool.

### Capacity Validation
During trip creation, after selecting a vehicle and entering cargo weight, real-time logic triggers:
- Compare `Trip.CargoWeight` to `Vehicle.MaxCapacity`.
- If `Trip.CargoWeight` > `Vehicle.MaxCapacity`, the system throws a hard "Overweight" error block. The UI "Create" button remains disabled until the weight is corrected to a safe threshold.

### Conflict Rules
Complex real-world scenarios must be handled gracefully:
- **Maintenance while Assigned to Future Trip:** If a vehicle is placed `In Shop` while assigned to upcoming `Draft` trips, those specific trips are flagged with a "Vehicle Conflict" warning, requiring the dispatcher to reassign the trip to an `Available` vehicle.
- **Retired with Scheduled Trips:** Changing a vehicle to `Out of Service` will cascade-cancel (or forcibly flag for reassignment) all future scheduled trips attached to it.
- **Manual Status Override:** Manual attempts by standard dispatchers to alter a vehicle status currently locked by an active trip or open service log are blocked; only system-level events (completing a trip, closing a log) or high-privileged roles (Supervisors) can override state.

## 5. Data Model Overview

### Entities

**1. Vehicle**
The core physical asset.
- `id` (PK, UUID)
- `name` (String)
- `license_plate` (String, UNIQUE)
- `max_capacity_kg` (Numeric)
- `odometer` (Numeric)
- `status` (Enum: Available, Assigned, In Shop, Out of Service)

**2. Trip**
The delivery or dispatch event.
- `id` (PK, UUID)
- `vehicle_id` (FK -> Vehicle.id)
- `cargo_weight_kg` (Numeric)
- `status` (Enum: Draft, Dispatched, Completed, Cancelled)

**3. ServiceLog**
The record of maintenance.
- `id` (PK, UUID)
- `vehicle_id` (FK -> Vehicle.id)
- `service_type` (Enum: Preventative, Repair)
- `start_date` (Timestamp)
- `end_date` (Timestamp, Nullable)
- `notes` (String)
- `status` (Enum: Open, Closed)

### Relationships
- **Vehicle (1) <---> (Many) Trip**: A vehicle can over time participate in many trips, but only one active trip at a time.
- **Vehicle (1) <---> (Many) ServiceLog**: A vehicle accumulates a history of service logs, but typically only one open log at a time.

### Status Synchronization Details
Updates flow linearly across entities:
1. User creates a highly-critical `ServiceLog` via UI.
2. The Database/Backend intercepts the "Open" state.
3. The Backend automatically dispatches an update to the `Vehicle` entity (`UPDATE vehicles SET status = 'In Shop' WHERE id = ServiceLog.vehicle_id`).
4. The Dispatcher UI polling interval pulls the updated Vehicle list—the `In Shop` vehicle is instantly removed from the selection dropdown, preventing any subsequent conflicting dispatch attempt.
