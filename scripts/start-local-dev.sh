#!/bin/bash

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker first."
  exit 1
fi

# Check if postgres container exists and is running
if ! docker ps | grep local-postgres > /dev/null; then
  # Check if container exists but is not running
  if docker ps -a | grep local-postgres > /dev/null; then
    echo "Starting existing postgres container..."
    docker start local-postgres
  else
    echo "Creating new postgres container..."
    docker run --name local-postgres \
      -e POSTGRES_PASSWORD=devpassword \
      -e POSTGRES_USER=devuser \
      -e POSTGRES_DB=devdb \
      -p 5432:5432 \
      -d postgres
    
    # Wait a moment for container to fully start
    echo "Waiting for postgres to start..."
    sleep 5
  fi
else
  echo "Postgres container is already running"
fi

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "Creating .env.local file..."
  echo "# Local Database Connection" > .env.local
  echo "DATABASE_URL=postgresql://devuser:devpassword@localhost:5432/devdb" >> .env.local
  echo "" >> .env.local
  echo "# Add your other environment variables here" >> .env.local
fi

# Install dotenv if not already installed
echo "Making sure dependencies are installed..."
pnpm add dotenv

# Setup the database
echo "Setting up database tables..."
node scripts/setup-local-db.js

# Start the development server
echo "Starting Next.js dev server..."
pnpm dev 