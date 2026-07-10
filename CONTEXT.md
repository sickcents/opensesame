# Spatial Wayfinding System

Gives facility and operations teams live visibility into indoor asset status and location — without requiring on-site presence — by turning an uploaded floor plan PDF into a scaled, queryable vector model of a facility.

## Language

**Facility**:
A single building or site modeled in the system, made up of one or more Floors and anchored once to a geographic location on a world map. Created by uploading a PDF for its first Floor.
_Avoid_: Site, building, location

**Floor**:
A single level of a Facility (e.g., "Ground", "1", "B1"), each with its own uploaded PDF, Floor Plan, Scale Calibration, and floor-to-floor height. A Facility's Geo-Anchor is shared across all its Floors — only orientation and position are set once, not per floor.
_Avoid_: Level, storey

**Floor Plan**:
The vector line-art (SVG) extracted from a Floor's uploaded PDF after its text is stripped out — the structural layout (walls, boundaries) that rooms, equipment, and areas are placed against.
_Avoid_: Blueprint, map, drawing

**Scale Calibration**:
A one-time step done per Floor where the user marks two points on that Floor's Floor Plan and states their real-world distance, establishing the conversion from SVG units to meters. All room, equipment, and area placements are stored in real-world units, not raw SVG coordinates.
_Avoid_: Scaling, unit conversion

**Geo-Anchoring**:
A one-time step done once per Facility (at creation of its first Floor), where the user drops a pin on a Leaflet/OSM map for the building's real-world location and rotates the (already-scaled) Floor Plan to match true orientation. Fixes the transform from local Floor Plan meters to world lat/lng for every Floor in the Facility.
_Avoid_: Georeferencing, geolocation

**Equipment**:
An instance of a predefined Equipment Type (Server Rack, Network Rack, UPS Rack, Security Rack, ...) placed on a Floor Plan as a rectangle sized to that type's real-world default footprint. v1 does not support per-instance resizing or free-form/custom equipment.
_Avoid_: Asset, device

**Equipment Type**:
A catalog entry (e.g. "Server Rack") defining a display name and a default real-world footprint (width × depth × height in meters) that new Equipment instances of that type inherit — height is used to extrude the Equipment in the 3D view. Adding a new type is a data change, not a schema change.
_Avoid_: Category, kind

**Room**:
An enclosed space on a Floor Plan, drawn as an arbitrary polygon (not restricted to a rectangle) and mapped strictly against the Floor Plan's real-world coordinates.
_Avoid_: Zone (see Area)

**Area**:
A polygon region on a Floor Plan that isn't an enclosed Room — e.g. a walkway or a Protective-Equipment zone. Same geometry as Room (arbitrary polygon), distinguished by not representing a walled space.
_Avoid_: Zone, region

**Safety Equipment**:
A point marker on a Floor Plan for life-safety items (exit, fire extinguisher). Unlike Equipment, it has no footprint — it's a location, not a placed object with real-world size.
_Avoid_: Safety asset

**Issue**:
A polymorphic problem report referencing exactly one Room, Area, Equipment, or Safety Equipment instance, created by clicking that item on the Floor Plan. Anyone can report one by typing a free-text reporter name (no login required). Has a status (Open or Resolved) and is assigned to a Department. One Issue model serves all four subject types rather than separate reporting paths per type.
_Avoid_: Ticket, fault, report

**Department**:
The team an Issue is assigned to for resolution: IT, Facilities, Safety, Security, or Operations. A fixed set, not user-defined.
_Avoid_: Team, assignee

**Organization**:
The top-level tenant that owns Facilities and Users. All data is scoped to exactly one Organization; nothing is shared across tenants.
_Avoid_: Company, tenant, account

**Editor** / **Member**:
The two Roles a User can have within an Organization. Editors can create and edit Facilities (upload PDFs, Scale Calibration, Geo-Anchoring, placing Rooms/Equipment/Areas/Safety Equipment). Members can only view Facilities and report/resolve Issues. Department is a routing label on an Issue, not an access-control boundary — it does not gate who can resolve what.
_Documented but not enforced in this build — there is no login, so every visitor has full access. The Role model exists so a future auth addition gates existing actions rather than inventing the boundary from scratch._
_Avoid_: Admin, permission level
