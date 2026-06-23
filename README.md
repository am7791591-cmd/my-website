# Dawat-e-Islami Education Portal

A complete starter website with frontend and backend for:

- Organization/admin dashboard
- Teacher portal to begin class sessions
- Teacher and student attendance
- Fee portal for dues, partial payments, and paid records
- Teacher and student record checking

## Demo Access

The UI includes a demo role switcher. API login records are seeded in `data/db.json`:

- Admin: `admin@portal.test` / `admin123`
- Teacher: `teacher@portal.test` / `teacher123`
- Fee officer: `fee@portal.test` / `fee123`

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

This project uses only built-in Node.js modules, so there is no install step.

## Publish Online

You can deploy this to Render, Railway, Fly.io, Azure App Service, or any Node.js hosting provider.

Basic settings:

- Build command: leave empty
- Start command: `npm start`
- Port: hosting provider should set `PORT` automatically

After deployment, add your domain in the hosting provider, then submit the final URL to Google Search Console for indexing. The site already includes SEO title, description, and `robots.txt`.

## Production Notes

Before real student data is used:

- Replace the JSON file database with PostgreSQL, MySQL, MongoDB, or Firebase.
- Add secure authentication with hashed passwords and sessions/JWT.
- Add role permissions on every API route.
- Add backups and audit logs for fee/payment records.
- Replace placeholder branding/contact details with your official assets.
