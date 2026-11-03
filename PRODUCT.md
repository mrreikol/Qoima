# Qoima — Digital Warehouse

## Platform
Web application. React, JavaScript, Vite, Tailwind CSS, React Router, Lucide React and Supabase.

## Users and work
Small-business inventory owners need to understand current stock, find/add products, receive/remove stock, reconcile physical quantities, inspect movements, export inventory and manage account access. These facts are supplied by the user's implementation brief and existing verified features.

## Functional commitments
Account-scoped persistent products and categories; archival retains history. Stock changes are atomic and idempotent, disallow negative stock, and retain the original operation UUID after uncertain requests. Ordinary metadata editing excludes quantity. Dashboard totals cover all active products. History search/filters/pagination and exports cover complete matching data. Local calendar dates determine reporting boundaries. Authentication, confirmation/recovery, redirects, RLS and ownership isolation must remain unchanged.

## Boundaries
No remote mutations during design verification, no migration/RPC/grant changes, no credentials in output, no unsupported controls, no push/deployment. Isolated fictional UI fixtures are allowed only outside production flows. English interface and documentation; Russian progress/reporting.

## Design authority
Preserve the approved Qoima visual system and inventory workflows documented in DESIGN.md. The application supports both light and dark surfaces, resolved by the Settings-only appearance preference. Publication preparation does not authorize another redesign.


## Brand and device appearance
The current product name is Qoima, with the Digital Warehouse tagline and supplied geometric Q/storage-cell mark. Settings alone offers Light/Dark/System appearance. System is the default; preferences are browser-local and affect all routes, including authentication. Existing technical identifiers and recovery keys remain unchanged.
