RESTART EVERYTHING
docker system prune -a --volumes

# DB
docker compose -f docker-compose.db.yml up --build

# Create DB tables
pnpm 

# docker volume rm main-repo_shared-node-modules main-repo_root-node-modules main-repo_vite-node-modules
# Dev
docker compose -f docker-compose.dev.yml down
docker volume rm autumn-oss_shared-node-modules autumn-oss_root-node-modules autumn-oss_vite-node-modules
docker compose -f docker-compose.dev.yml build --no-cache
docker compose -f docker-compose.dev.yml up --build

# Prod
docker compose -f docker-compose.prod.yml up --build
---