# Contributing to Autumn

Hello! Thank you for your interest in contributing to Autumn :)

## How to contribute

1. First, set up Autumn locally using the installation guide [below](#installation-guide)

2. Create a new branch for your changes

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

3. Commit your changes with clear, descriptive messages (you can use [commitizen](https://www.npmjs.com/package/commitizen) to help with this):
```bash
git commit -m "docs: added new code snippet to concepts.md"
# or
git commit -m "fix: fixed rounding error on priceUtils.ts"
```

4. Fetch the latest updated repo and merge with your changes
```bash
git fetch upstream/staging
git merge upstream/staging
```

5. Push to your fork
```
git push origin your-branch-name
```

6. Submit a Pull Request to the staging branch
- Go to your fork on GitHub and click "New Pull Request"
- Fill out the PR template completely
- Link any relevant issues
- Add screenshots for UI changes

## Installation Guide

#### Requirements
- Node.js
- bun

### Quickstart

Use this guide if you want to get Autumn up and running on your device in the fastest way possible! We help you spin up all the required services (database, tunnel, etc.) and env variables through our setup script.

#### Step 0: Fork and Clone
1. Click the 'Fork' button at the top right of this repository
2. Clone your fork locally: `git clone https://github.com/YOUR-USERNAME/autumn.git`

#### Step 1: Install Dependencies
```bash
bun install
```

#### Step 2: Run Setup
```bash
bun run setup
```

The `setup` script generates required environment variables to run Autumn locally. It performs two main functions:
- Auto-spins up a Supabase database and creates required tables (optional)
- Generates a localtunnel reserved key for receiving Stripe webhooks in development

#### Step 3: Start Development Environment
```bash
docker compose -f docker-compose.dev.yml up # (if on windows)
# or
docker compose -f docker-compose.unix.yml up # (if on mac / linux)
```

### Manual Setup

Use this approach if you prefer to configure your own database or tunneling solution (e.g., ngrok, cloudflared) instead of our default localtunnel setup.

1. Copy `server/.env.example` to `server/.env` and fill in environment variables according to the [Environment Variables](#environment-variables) guide
2. Copy `vite/.env.example` to `vite/.env`
3. Run the Docker command from Step 3 above


## Database Management
Autumn uses Postgres as it's database solution, and Drizzle ORM to manage our queries / migrations. 

Our cloud offering uses Supabase to host Postgres, but you can use any hosting solution you'd like. At the moment, our docker compose does not spin up a database for you, so you'll have to do this yourself (we help you set up Supabase super easily in our set up script).

#### Creating Database Tables
Make sure you have the `DATABASE_URL` env variable set up in `server/.env` before you run any of the following commands.

If you're setting up an Autumn DB for the first time, use the following command to generate the required tables
```bash
bun run db:push
```

#### Handling Migrations
When you need to create version-controlled migrations (e.g., for new releases):

1. **Generate migration files:**
   ```bash
   bun run db:generate
   ```
   This creates migration files based on schema changes.

2. **Apply migrations:**
   ```bash
   bun run db:migrate
   ```
   This applies pending migrations to your database.


<!-- 
---
## Environment Variables

### Authentication
- `BETTER_AUTH_SECRET` - Secret key for better-auth provider
- `BETTER_AUTH_URL` - Base URL for better-auth
- `CLIENT_URL` - Client application URL

### Encryption
- `ENCRYPTION_IV` - Initialization vector for AES-256 encryption of Stripe API keys
- `ENCRYPTION_PASSWORD` - Password for AES-256 encryption of Stripe API keys

### Webhooks & Tunneling
- `LOCALTUNNEL_RESERVED_KEY` - Reserved subdomain key for localtunnel service
- `STRIPE_WEBHOOK_URL` - Base URL for registering Stripe webhooks

The `docker-compose.dev.yml` runs localtunnel using your `LOCALTUNNEL_RESERVED_KEY` as the subdomain. If using alternative tunneling (ngrok, cloudflared), ensure it points to port 8080 and update `STRIPE_WEBHOOK_URL` accordingly.

### Database
- `DATABASE_URL` - PostgreSQL connection string -->
