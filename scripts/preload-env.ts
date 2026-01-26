// Preload script - runs BEFORE main script imports are evaluated
// This allows local .env to override Infisical secrets
import { loadLocalEnv } from "@server/utils/envUtils.js";

loadLocalEnv();
