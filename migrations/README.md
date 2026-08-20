# Database Migrations

This directory contains version-controlled SQL migration scripts for the Tesla full-stack application.

## Principles:
1. Every schema change must have a sequential migration file (e.g., `001_initial_schema.sql`, `002_create_users_table.sql`).
2. Migrations are executed in alphabetical order.
3. The `schema_migrations` table tracks all applied migrations to prevent duplicate runs.
4. Database migrations must be atomic and reversible where applicable.
