import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { addAutumnColumns, runStripeSyncMigrations } from "../src/index.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

config({ path: path.join(repoRoot, "server/.env"), override: true });

const databaseUrl = process.env.STRIPE_SYNC_DATABASE_URL;

if (!databaseUrl) {
	console.error("STRIPE_SYNC_DATABASE_URL is required");
	process.exit(1);
}

console.log("Running stripe sync migrations...");
await runStripeSyncMigrations({ databaseUrl });
console.log("Stripe sync migrations complete");

console.log(
	"Adding Autumn columns (stripe_account_id, org_id) to synced tables...",
);
await addAutumnColumns({ databaseUrl });
console.log("Autumn columns added");
