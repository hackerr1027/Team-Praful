# Trip Dispatcher & Management System

## PART 1 — Functional & Workflow Architecture

---

## 1. Dispatcher Persona

### Role Definition
The **Fleet Dispatcher** is the operational nerve center of the logistics workflow. They are the human decision-maker who bridges customer demand with fleet capacity in real-time.

### Responsibilities
| Area | Duties |
|------|--------|
| **Trip Planning** | Create trips, assign vehicles/drivers, validate cargo loads, set pickup/delivery windows |
| **Resource Allocation** | Match available vehicles to cargo requirements, assign qualified drivers to routes |
| **Conflict Resolution** | Handle overlapping schedules, resolve capacity disputes, manage driver shift conflicts |
| **Exception Management** | React to breakdowns, no-shows, cargo discrepancies, weather delays |
| **Compliance** | Ensure weight limits, driver hour regulations, hazmat compatibility, route feasibility |

### Pain Points
1. **Information Overload** — Multiple trips, vehicles, and drivers changing state simultaneously
2. **Time Pressure** — Urgent dispatches require sub-minute decisions with zero tolerance for errors
3. **Concurrency Conflicts** — Two dispatchers assigning the same vehicle/driver simultaneously
4. **Visibility Gaps** — Incomplete knowledge of vehicle maintenance status, driver fatigue, real-time cargo changes
5. **Cascading Failures** — One cancelled trip ripples into re-assignments across the pipeline

### Decision-Making Pressure Matrix
| Scenario | Time Window | Risk Level | Decision Complexity |
|----------|-------------|------------|---------------------|
| Standard dispatch | 5-15 min | Low | Low — routine matching |
| Urgent cargo | < 2 min | High | High — limited options, pressure to override |
| Vehicle breakdown mid-route | < 5 min | Critical | Very High — reassign vehicle, driver, notify customer |
| Double-booking detected | Immediate | High | Medium — one trip must be reassigned |

### Common Failure Scenarios
1. **Overloading** — Dispatcher manually estimates cargo weight, exceeds vehicle capacity
2. **Schedule Overlap** — Vehicle assigned to Trip A still en route when Trip B starts
3. **Driver Fatigue** — Driver assigned beyond shift hours without system enforcement
4. **Stale Data** — Dispatcher sees vehicle as "Available" but another dispatcher just assigned it
5. **Misrouted Cargo** — Wrong origin/destination entered due to UI complexity

---

## 2. Trip Creation Workflow

### Step-by-Step Dispatcher Flow

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Dispatcher opens Trip Creation Form                 │
│   → System pre-loads current timestamp, dispatcher ID       │
│   → System fetches available vehicles & drivers             │
├─────────────────────────────────────────────────────────────┤
│ STEP 2: Select Vehicle                                      │
│   → System shows ONLY vehicles with status = "Available"    │
│   → Each vehicle card shows: Type, Capacity, Region, Fuel   │
│   → Dispatcher selects one → system SOFT-RESERVES it (60s)  │
├─────────────────────────────────────────────────────────────┤
│ STEP 3: Select Driver                                       │
│   → System shows ONLY drivers with status = "Available"     │
│   → Filtered to drivers licensed for selected vehicle type  │
│   → Each driver card shows: Name, Shift End, Current Hours  │
│   → Dispatcher selects one → system SOFT-RESERVES (60s)     │
├─────────────────────────────────────────────────────────────┤
│ STEP 4: Enter Cargo Details                                 │
│   → Dispatcher enters: Weight (kg), Cargo Type, Description │
│   → LIVE VALIDATION fires on every keystroke:               │
│     ├─ < 85% capacity  → ✅ Green indicator                 │
│     ├─ 85-100% capacity → ⚠️ Yellow warning                │
│     └─ > 100% capacity → 🛑 Red HARD STOP (submit blocked) │
├─────────────────────────────────────────────────────────────┤
│ STEP 5: Set Route & Schedule                                │
│   → Select Origin (dropdown or map pin)                     │
│   → Select Destination (dropdown or map pin)                │
│   → Set Pickup Time (must be ≥ NOW + 30 min buffer)         │
│   → Set Delivery Deadline                                   │
│   → System validates time feasibility against route distance │
├─────────────────────────────────────────────────────────────┤
│ STEP 6: Review & Confirm Draft                              │
│   → Summary screen with all details + validation status     │
│   → All validations must be ✅ to enable "Create Draft"     │
│   → Dispatcher clicks "Create Draft" → Trip status = DRAFT  │
├─────────────────────────────────────────────────────────────┤
│ STEP 7: Dispatch                                            │
│   → Dispatcher reviews draft, clicks "Dispatch"             │
│   → System performs FINAL validation sweep                  │
│   → If passed → Trip status = DISPATCHED                    │
│   → Vehicle status → "On Trip"                              │
│   → Driver status → "On Trip"                               │
│   → Notifications sent to driver                            │
└─────────────────────────────────────────────────────────────┘
```

### Time Validation Logic
| Rule | Condition | Response |
|------|-----------|----------|
| Pickup too soon | `pickupTime < NOW + 30min` | ⚠️ Warning: "Tight schedule — driver may not reach in time" |
| Pickup in past | `pickupTime < NOW` | 🛑 Hard stop: "Pickup time cannot be in the past" |
| Impossible delivery | `estimatedTravelTime > (deadline - pickupTime)` | 🛑 Hard stop: "Delivery deadline is not feasible for this route" |
| Driver shift overflow | `estimatedTripEnd > driver.shiftEndTime` | ⚠️ Warning: "Trip may extend beyond driver's shift" |

### Overlapping Schedule Prevention
Before confirming a draft, the system checks:
```
FOR selected vehicle:
  IF EXISTS any trip WHERE:
    trip.status IN ('Draft', 'Dispatched')
    AND trip.vehicle_id = selected_vehicle
    AND trip.pickup_time < new_trip.estimated_end
    AND trip.estimated_end > new_trip.pickup_time
  THEN → 🛑 BLOCK: "Vehicle has a conflicting trip"
```
Same logic applies to drivers.

---

## 3. Vehicle & Driver Availability Logic

### Vehicle Availability Definition
A vehicle is **"Available"** when ALL of the following are true:

| Condition | Check |
|-----------|-------|
| Not on an active trip | `status != 'On Trip'` |
| Not in maintenance | `status != 'In Shop'` |
| Not soft-reserved | `soft_lock_expires_at IS NULL OR soft_lock_expires_at < NOW()` |
| No overlapping future trips | No Draft/Dispatched trips in the requested time window |
| Fuel sufficient | `fuel_level > minimum_threshold` (if tracked) |

### Driver Availability Definition
A driver is **"Available"** when ALL of the following are true:

| Condition | Check |
|-----------|-------|
| Not on an active trip | `status != 'On Trip'` |
| Within shift hours | `NOW() BETWEEN shift_start AND shift_end` |
| Not soft-reserved | `soft_lock_expires_at IS NULL OR soft_lock_expires_at < NOW()` |
| No overlapping future trips | No Draft/Dispatched trips in the requested time window |
| Licensed for vehicle type | `driver.license_class` covers selected vehicle type |
| Hours compliant | `daily_hours_driven < max_daily_hours` |

### Soft Reservation Mechanism
When a dispatcher selects a vehicle or driver in the form:

1. System creates a **soft lock** with a 60-second TTL
2. The resource appears as "Reserved" to other dispatchers
3. If the dispatcher doesn't confirm within 60s → lock auto-expires
4. If confirmed → lock converts to a hard assignment
5. If dispatcher cancels → lock released immediately

### Concurrency Conflict Resolution
| Scenario | System Behavior |
|----------|-----------------|
| Dispatcher A selects Vehicle X, Dispatcher B tries to select it | B sees "Temporarily Reserved" badge, can't select |
| Soft lock expires while A is still filling form | Vehicle becomes available again, A gets a warning toast |
| Both dispatchers submit simultaneously | Database-level optimistic lock — second submission gets `409 Conflict` |

---

## 4. Validation Engine — Rules & Behavior

### Validation Tiers

#### Tier 1: Hard-Stop Errors (🛑 Blocks submission)
| Rule ID | Rule | Condition | Message |
|---------|------|-----------|---------|
| V-001 | Overweight | `cargo_weight > vehicle.max_capacity` | "Cargo exceeds vehicle capacity by {X} kg" |
| V-002 | Past pickup | `pickup_time < NOW()` | "Pickup time is in the past" |
| V-003 | Infeasible deadline | `travel_time > (deadline - pickup)` | "Delivery deadline not achievable" |
| V-004 | Vehicle unavailable | Vehicle status changed during form fill | "Vehicle is no longer available" |
| V-005 | Driver unavailable | Driver status changed during form fill | "Driver is no longer available" |
| V-006 | Schedule conflict | Overlapping trip exists | "Conflicting trip #{id} for this resource" |

#### Tier 2: Soft Warnings (⚠️ Allows submission with acknowledgment)
| Rule ID | Rule | Condition | Message |
|---------|------|-----------|---------|
| W-001 | Near capacity | `cargo_weight > 0.85 * max_capacity` | "Cargo is at {X}% of vehicle capacity" |
| W-002 | Tight schedule | `pickup_time < NOW + 30min` | "Limited preparation time" |
| W-003 | Shift overflow | `trip_end > driver.shift_end` | "Trip may extend past driver's shift" |
| W-004 | Low fuel | `vehicle.fuel < route_fuel_requirement * 1.2` | "Vehicle fuel may be insufficient" |
| W-005 | Long route | `route_distance > 500km` | "Extended route — consider rest stops" |

#### Tier 3: Informational (ℹ️ Display only)
| Rule ID | Rule | Message |
|---------|------|---------|
| I-001 | First-time route | "This driver hasn't done this route before" |
| I-002 | Vehicle age | "Vehicle is due for service in {X} days" |

### Override Logic
For **Tier 2 warnings ONLY**, a Supervisor can override:
1. Dispatcher submits trip with active warnings
2. System requires **explicit checkbox**: "I acknowledge the following warnings: [list]"
3. Override is logged in AuditLog with dispatcher ID, timestamp, and reason
4. Tier 1 hard-stops **cannot be overridden** under any circumstances

### Validation Execution Order
```
1. Check vehicle.status === 'Available'      (instant, from cache)
2. Check driver.status === 'Available'       (instant, from cache)
3. Check cargo_weight <= max_capacity        (instant, client-side)
4. Check schedule conflicts (vehicle)        (DB query)
5. Check schedule conflicts (driver)         (DB query)
6. Check time feasibility                    (route API call)
7. Check fuel sufficiency                    (if applicable)
8. Check driver shift compliance             (DB query)
```

---

## 5. Lifecycle State Machine

### State Diagram

```
                    ┌──────────┐
          ┌────────→│ CANCELLED │
          │         └──────────┘
          │              ▲
          │              │ cancel()
          │              │
     ┌────┴───┐    ┌─────┴──────┐     ┌───────────┐
     │ DRAFT  ├───→│ DISPATCHED ├────→│ COMPLETED  │
     └────────┘    └────────────┘     └───────────┘
      dispatch()     complete()
```

### Transition Rules

| From | To | Trigger | Permission | Pre-conditions |
|------|----|---------|------------|----------------|
| `DRAFT` | `DISPATCHED` | `dispatch()` | Dispatcher, Supervisor | All validations pass, vehicle+driver available |
| `DRAFT` | `CANCELLED` | `cancel()` | Dispatcher, Supervisor | None — always allowed |
| `DISPATCHED` | `COMPLETED` | `complete()` | Dispatcher, Supervisor, System | Vehicle reached destination OR manual confirmation |
| `DISPATCHED` | `CANCELLED` | `cancel()` | Supervisor ONLY | Requires cancellation reason (mandatory) |

### Forbidden Transitions
| Transition | Reason |
|------------|--------|
| `COMPLETED` → any | Terminal state — immutable |
| `CANCELLED` → any | Terminal state — immutable |
| `DISPATCHED` → `DRAFT` | Cannot un-dispatch — create a new trip instead |
| `COMPLETED` → `CANCELLED` | Cannot cancel what's already delivered |

### Auto-Transition Triggers
| Trigger | Action |
|---------|--------|
| Vehicle arrives at destination GPS coordinates | System prompts dispatcher to confirm completion |
| Trip exceeds delivery deadline by 2+ hours with no update | System flags for Supervisor review |
| Draft trip not dispatched within 24 hours | System auto-cancels with reason "Expired Draft" |

### Side Effects on Transition
| Transition | Side Effects |
|------------|-------------|
| `DRAFT → DISPATCHED` | Vehicle → "On Trip", Driver → "On Trip", soft lock → hard lock, notification sent |
| `DISPATCHED → COMPLETED` | Vehicle → "Available", Driver → "Available", cargo marked delivered, mileage logged |
| `DISPATCHED → CANCELLED` | Vehicle → "Available", Driver → "Available", cargo returned to pending pool |
| `DRAFT → CANCELLED` | Release soft locks, no resource state changes |

### Role-Based Permissions Matrix
| Action | Dispatcher | Supervisor | System |
|--------|-----------|------------|--------|
| Create Draft | ✅ | ✅ | ❌ |
| Dispatch | ✅ | ✅ | ❌ |
| Complete | ✅ | ✅ | ✅ (auto) |
| Cancel Draft | ✅ | ✅ | ✅ (auto-expire) |
| Cancel Dispatched | ❌ | ✅ | ❌ |
| Override warnings | ❌ | ✅ | ❌ |
| View audit log | ❌ | ✅ | — |

---

## 6. Exception Handling

### Exception 1: Vehicle Breakdown After Dispatch
```
TRIGGER:  Driver reports breakdown OR telemetry detects anomaly
SEVERITY: Critical
RESPONSE:
  1. Trip status stays "DISPATCHED" but flagged "EXCEPTION"
  2. System alerts Supervisor immediately
  3. System shows list of nearby available vehicles
  4. Supervisor creates REPLACEMENT TRIP:
     - Same cargo, driver, destination
     - New vehicle assigned
     - Original trip → status "CANCELLED" with reason "Vehicle Breakdown"
     - New trip → linked via `replacement_for` field
  5. Audit log captures full chain of events
```

### Exception 2: Driver No-Show
```
TRIGGER:  Pickup time passes + 15 min with no GPS movement
SEVERITY: High
RESPONSE:
  1. System sends alert to Dispatcher + Supervisor
  2. 30-minute grace window starts
  3. If driver responds → trip continues, incident logged
  4. If no response after 30 min:
     - Trip flagged for reassignment
     - System shows available drivers
     - Supervisor reassigns driver
     - Original driver marked "Unavailable — Under Review"
  5. Audit log records no-show event
```

### Exception 3: Cargo Weight Misreport
```
TRIGGER:  Actual weight at pickup exceeds declared weight
SEVERITY: High (if over capacity), Medium (if within capacity)
RESPONSE:
  IF actual_weight > vehicle.max_capacity:
    1. Trip BLOCKED at pickup point
    2. Dispatcher notified: "Actual cargo weight exceeds capacity"
    3. Options: Split cargo, assign larger vehicle, or cancel
    4. Decision logged with photos/evidence if available
  IF actual_weight > declared BUT <= max_capacity:
    1. Warning logged
    2. Trip proceeds with updated weight
    3. Discrepancy flagged for shipper review
```

### Exception 4: Trip Cancellation Mid-Route
```
TRIGGER:  Supervisor cancels a DISPATCHED trip while vehicle is en route
SEVERITY: High
RESPONSE:
  1. Driver receives immediate notification with instructions
  2. Trip status → "CANCELLED" with reason
  3. System calculates nearest depot/return point
  4. Vehicle directed to return cargo or proceed to safe location
  5. Vehicle + Driver released back to available pool ONLY after
     reaching depot (confirmed by GPS)
  6. Cargo returned to pending pool or marked as "Returned"
  7. Full audit trail with timestamps, GPS coordinates, cancellation reason
```

### Exception Summary Matrix
| Exception | Detection | Response Time | Escalation |
|-----------|-----------|---------------|------------|
| Vehicle Breakdown | Telemetry + Driver Report | < 5 min | Auto → Supervisor |
| Driver No-Show | GPS + Timer | 15 min grace | Auto → Dispatcher → Supervisor |
| Weight Misreport | Pickup Checkpoint | Immediate | Dispatcher decides |
| Mid-Route Cancel | Supervisor Action | Immediate | Driver notified |

---

## 7. UX Logic Blueprint

### Form Design Principles
1. **Progressive Disclosure** — Show fields only as previous selections are made (vehicle → driver → cargo → route)
2. **Live Feedback** — Validation runs on every interaction, not just on submit
3. **Color-Coded Status** — Green (safe), Yellow (warning), Red (blocked)
4. **Sticky Summary Bar** — Bottom bar always shows: selected vehicle, driver, cargo weight, and validation status
5. **Keyboard Shortcuts** — `Ctrl+D` to dispatch, `Esc` to cancel, `Tab` to navigate

### Capacity Gauge Widget
```
┌─────────────────────────────────────┐
│  CARGO LOAD                         │
│  ████████████████░░░░  3,200 kg     │
│  ▏            85%▕  Max: 4,000 kg   │
│  ⚠️ Warning: Approaching capacity   │
└─────────────────────────────────────┘
```
- **0-84%**: Green progress bar
- **85-99%**: Yellow progress bar + warning text
- **100%+**: Red progress bar + hard stop + submit disabled

### Conflict Toast Notifications
When a dispatcher's soft-reserved resource becomes unavailable:
```
┌──────────────────────────────────────────┐
│ ⚠️ Vehicle T1 is no longer available     │
│ Another dispatcher has assigned it.      │
│ [Select New Vehicle]  [Dismiss]          │
└──────────────────────────────────────────┘
```

### Dispatch Confirmation Dialog
Before final dispatch, a modal shows:
```
┌──────────────────────────────────────────┐
│ ✅ CONFIRM DISPATCH                       │
│                                          │
│ Vehicle:  T1 (Truck, 4000 kg max)        │
│ Driver:   Rajesh K. (Shift ends 6:00 PM) │
│ Cargo:    3,200 kg Electronics           │
│ Route:    Naroda → SG Highway (28 km)    │
│ Pickup:   11:00 AM                       │
│ Deadline: 2:00 PM                        │
│                                          │
│ Validations: ✅ All passed               │
│                                          │
│      [Cancel]    [DISPATCH NOW]          │
└──────────────────────────────────────────┘
```
