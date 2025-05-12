# Local Database Setup

This directory contains scripts for setting up and maintaining your local PostgreSQL database for development.

## Prerequisites

1. Install Docker if you haven't already: https://www.docker.com/products/docker-desktop/
2. Make sure Node.js is installed

## Setup Instructions

### 1. Start a Local PostgreSQL Docker Container

```bash
docker run --name local-postgres \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_USER=devuser \
  -e POSTGRES_DB=devdb \
  -p 5432:5432 \
  -d postgres
```

### 2. Create a `.env.local` file in the project root

```
DATABASE_URL=postgresql://devuser:devpassword@localhost:5432/devdb
```

### 3. Install required dependencies

```bash
pnpm add dotenv
```

### 4. Run the database setup script

```bash
node scripts/setup-local-db.js
```

This will create all the necessary tables in your local database.

## Maintenance Scripts

### Cleanup Stale Users

To manually clean up stale users from the waiting queue:

```bash
node scripts/cleanup-stale-users.js
```

## Automatic Cleanup

You can set up a cron job to run the cleanup script automatically. On macOS/Linux:

```bash
crontab -e
```

Then add:

```
*/2 * * * * cd /path/to/your/project && node scripts/cleanup-stale-users.js
```

This will run the cleanup script every 2 minutes.

## Troubleshooting

- **Connection Refused**: Make sure the Docker container is running. Check with `docker ps`
- **Auth Error**: Verify your DATABASE_URL has the correct username and password
- **Container Stopped**: Restart with `docker start local-postgres`
