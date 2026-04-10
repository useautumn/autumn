import { runMigrations } from "@supabase/stripe-sync-engine";

/**
 * Run stripe-sync-engine migrations against the sync DB.
 * Idempotent -- safe to run multiple times.
 */
export const runStripeSyncMigrations = async ({
	databaseUrl,
	schema = "stripe",
}: {
	databaseUrl: string;
	schema?: string;
}): Promise<void> => {
	await runMigrations({ databaseUrl, schema });
};
