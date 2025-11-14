// Entry point: Load Infisical secrets, then start the app
// Instead of:
import "dotenv/config";

import cluster from "node:cluster";

import { initInfisical } from "./external/infisical/initInfisical.js";

// Load Infisical secrets into process.env ONLY in master/primary process
// Infisical will NOT override existing env vars (from .env above)
if (cluster.isPrimary) {
	await initInfisical();

	const { initializeDatabaseFunctions } = await import(
		"./db/initializeDatabaseFunctions.js"
	);
	await initializeDatabaseFunctions();
}

// Now dynamically import and run the main app
await import("./init.js");
