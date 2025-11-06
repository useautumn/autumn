// Entry point: Load Infisical secrets, then start the app
import "dotenv/config";
import cluster from "node:cluster";
import { initInfisical } from "./external/infisical/initInfisical.js";

// Load Infisical secrets into process.env ONLY in master/primary process
// Workers will inherit the env vars from master via fork
if (cluster.isPrimary) {
	await initInfisical();
}

// Now dynamically import and run the main app
await import("./init.js");
