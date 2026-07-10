# PostGIS for Room/Area/Equipment/Safety Equipment geometry

Spatial data (Room/Area polygons, Equipment/Safety Equipment points) is stored in PostGIS geometry columns, not plain JSON. This gives indexed, correct spatial queries (`ST_Distance`, `ST_Contains`, etc.) for the "what's near what" questions the Gemini query tools need to answer, instead of hand-rolled point-in-polygon and distance math in application code. Runs on Neon's free tier (PostGIS is a bundled extension, no added cost), keeping the demo deployment free.
