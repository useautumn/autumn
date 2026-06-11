import { loadLocalEnv } from "@server/utils/envUtils";
import inquirer from "inquirer";

loadLocalEnv();

// Dev worktrees (scripts/dw): overlay server/.env.local -- the same override
// `bun dw run` gets via Bun's automatic .env.local loading -- so functions
// land on the worktree's Neon branch instead of the canonical dev DB. Never
// applied for prod targets (migrate-functions:prod): infisical injects the
// prod DATABASE_URL before this script starts, and prod URLs carry the
// us-east-2 marker (same convention as assertNotProductionDb).
if (!process.env.DATABASE_URL?.includes("us-east-2")) {
	process.env.ENV_FILE = ".env.local";
	loadLocalEnv({ force: true });
}

export const migrateFunctions = async () => {
	// Dynamic import to ensure env is loaded first
	const { initializeDatabaseFunctions } = await import(
		"@server/db/initializeDatabaseFunctions"
	);
	const databaseUrl = process.env.DATABASE_URL;

	if (databaseUrl?.includes("us-east-2")) {
		const { confirm } = await inquirer.prompt([
			{
				type: "confirm",
				name: "confirm",
				message:
					"You are about to initialize database functions on PRODUCTION (us-west-3). Continue?",
				default: false,
			},
		]);

		if (!confirm) {
			console.log("Operation cancelled.");
			process.exit(0);
		}
	}

	await initializeDatabaseFunctions();
};

await migrateFunctions();
process.exit(0);
