import type { Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

type MigrationClient = {
	migrationsV2: {
		deleteAndCreate: (params: {
			id: string;
			filter?: MigrationFilter | null;
			operations?: Operations | null;
		}) => Promise<Migration>;
		run: (params: { id: string; dry_run?: boolean }) => Promise<{
			migration_id: string;
			dry_run: boolean;
			run_id: string;
		}>;
		listItemEvents: (params: {
			migrationId: string;
			migrationRunId?: string;
		}) => Promise<{ list: MigrationItemEvent[] }>;
	};
};

type MigrationItemEvent = {
	status: string;
	dry_run: boolean;
	item_id: string;
	response: unknown;
};

type PreviewResult = {
	status: string;
	dryRun: boolean;
	response: Record<string, unknown>;
};

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

function parseResponse(response: unknown): Record<string, unknown> {
	if (typeof response === "string") return JSON.parse(response);
	if (response && typeof response === "object")
		return response as Record<string, unknown>;
	throw new Error(`Invalid migration event response: ${String(response)}`);
}

export const runMigrationAndWait = async ({
	migrationClient,
	migrationId,
	filter,
	operations,
	dryRun = true,
	timeoutMs = 45_000,
}: {
	migrationClient: MigrationClient;
	migrationId: string;
	filter: MigrationFilter;
	operations: Operations;
	dryRun?: boolean;
	timeoutMs?: number;
}): Promise<PreviewResult> => {
	const migration = await migrationClient.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
	});
	const runResponse = await migrationClient.migrationsV2.run({
		id: migration.id,
		dry_run: dryRun,
	});

	const start = Date.now();
	let lastError: unknown;
	while (Date.now() - start < timeoutMs) {
		try {
			const events = await migrationClient.migrationsV2.listItemEvents({
				migrationId: migration.id,
				migrationRunId: runResponse.run_id,
			});
			const event = events.list[0];
			if (!event) throw new Error("No migration item event found");
			return {
				status: event.status,
				dryRun: event.dry_run,
				response: parseResponse(event.response),
			};
		} catch (error) {
			lastError = error;
			await timeout(1_000);
		}
	}
	throw new Error(
		`Timed out waiting for migration result: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
};
