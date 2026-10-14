import { runMigrations } from "@supabase/stripe-sync-engine";

export const runStripeSyncMigrations = async ({
	databaseUrl,
	schema = "stripe",
}: {
	databaseUrl: string;
	schema?: string;
}): Promise<void> => {
	await runMigrations({ databaseUrl, schema });
};
