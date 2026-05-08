import type { Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runPrepare } from "@/internal/migrations/v2/prepare/runPrepare.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";

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
	};
};

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const waitForMigrationResult = async ({
	waitFor,
	timeoutMs,
	pollIntervalMs,
}: {
	waitFor: () => Promise<void>;
	timeoutMs: number;
	pollIntervalMs: number;
}) => {
	const start = Date.now();
	let lastError: unknown;

	while (Date.now() - start < timeoutMs) {
		try {
			await waitFor();
			return;
		} catch (error) {
			lastError = error;
			await timeout(pollIntervalMs);
		}
	}

	throw new Error(
		`Timed out waiting for migration result after ${timeoutMs}ms: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
};

export const runUpdatePlanMigration = async ({
	ctx,
	migrationClient,
	migrationId,
	customerId,
	filter,
	operations,
	runOnServer = false,
	waitFor,
	timeoutMs = 30_000,
	pollIntervalMs = 1_000,
}: {
	ctx: AutumnContext;
	migrationClient: MigrationClient;
	migrationId: string;
	customerId: string;
	filter: MigrationFilter;
	operations: Operations;
	runOnServer?: boolean;
	waitFor?: () => Promise<void>;
	timeoutMs?: number;
	pollIntervalMs?: number;
}) => {
	const migration = await migrationClient.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
	});

	if (runOnServer) {
		await migrationClient.migrationsV2.run({
			id: migrationId,
			dry_run: false,
		});

		if (waitFor) {
			await waitForMigrationResult({ waitFor, timeoutMs, pollIntervalMs });
		} else {
			await timeout(timeoutMs);
		}

		return migration;
	}

	const { prepared_state } = await runPrepare({
		ctx,
		migration,
		dry_run: false,
	});

	const preparedMigration = { ...migration, prepared_state };

	await migrateCustomer({
		ctx,
		customerId,
		migration: preparedMigration,
	});

	return preparedMigration;
};
