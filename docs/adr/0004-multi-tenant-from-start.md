# Multi-tenant data model from the start

Facilities and Users belong to an Organization, even though the system currently runs for a single company. We chose to add the Organization boundary now rather than retrofit it, because adding a foreign key to every table today is cheap while adding tenant isolation after real data and queries exist would mean migrating every table and re-auditing every query for cross-tenant leaks.
