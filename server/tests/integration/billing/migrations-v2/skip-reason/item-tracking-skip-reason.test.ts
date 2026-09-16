/**
 * withMigrationItemTracking settles the item run's skip_reason for the paths
 * that never reach an operation:
 *   a guard hook skip                  → skipped, ineligible
 *   a transient DB drop during the run → skipped, ineligible
 *   a retry that then succeeds         → succeeded, skip_reason cleared
 */

import { expect, test } from "bun:test";
import {
	type FullCustomer,
	MigrationItemKind,
	MigrationItemRunStatus,
	MigrationRunStatus,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { withMigrationItemTracking } from "@/internal/migrations/v2/actions/migrationItem/withMigrationItemTracking.js";
import { buildSkippedMigrateCustomerResult } from "@/internal/migrations/v2/hooks/index.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/migrateCustomerContext.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import {
	expectMigrationItemRunStatus,
	getInternalCustomerId,
} from "../batch-migrations/batchTestUtils.js";

const transientDbError = () =>
	Object.assign(new Error("Connection terminated unexpectedly"), {
		code: "ECONNRESET",
	});

test.concurrent(
	`${chalk.yellowBright("item tracking skip reason: guard skips and connection drops are ineligible, a retry clears the reason")}`,
	async () => {
		const customerId = "item-tracking-skip-reason";
		const droppedId = `${customerId}-dropped`;
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.otherCustomers([{ id: droppedId }])],
			actions: [],
		});
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: migrationId,
		});
		const run = await migrationRunRepo.insert({
			ctx,
			insert: { migration_internal_id: migration.internal_id, dry_run: false },
		});
		if (!run) throw new Error("Seed run conflicted with a live run");
		const migrationRunId = run.internal_id;

		const itemFor = async (id: string) => ({
			kind: MigrationItemKind.Customer,
			internal_id: await getInternalCustomerId({ ctx, customerId: id }),
			id,
		});
		const guardedItem = await itemFor(customerId);
		const droppedItem = await itemFor(droppedId);
		const tracking = {
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			dryRun: false,
			claimItemRun: true,
		};
		const assertion = {
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
		};

		try {
			const guarded = await withMigrationItemTracking({
				...tracking,
				item: guardedItem,
				run: async () =>
					buildSkippedMigrateCustomerResult({
						context: {
							fullCustomer: { id: customerId } as FullCustomer,
						} as MigrateCustomerContext,
						skip: { reason: "manual_review" },
					}),
			});
			expect(guarded?.response).toMatchObject({
				skipped: { reason: "manual_review" },
				skip_reason: "ineligible",
			});
			await expectMigrationItemRunStatus({
				...assertion,
				customerId,
				status: MigrationItemRunStatus.Skipped,
				skipReason: "ineligible",
			});

			const dropped = await withMigrationItemTracking({
				...tracking,
				item: droppedItem,
				run: async () => {
					throw transientDbError();
				},
			});
			expect(dropped).toBeUndefined();
			await expectMigrationItemRunStatus({
				...assertion,
				customerId: droppedId,
				status: MigrationItemRunStatus.Skipped,
				skipReason: "ineligible",
			});

			await withMigrationItemTracking({
				...tracking,
				item: guardedItem,
				retryItemStatuses: ["skipped"],
				run: async () => ({
					itemPreview: { id: customerId, name: null, email: null },
					status: "succeeded" as const,
					response: {},
				}),
			});
			await expectMigrationItemRunStatus({
				...assertion,
				customerId,
				status: MigrationItemRunStatus.Succeeded,
				skipReason: null,
			});
		} finally {
			await migrationRunRepo.update({
				ctx,
				internalId: migrationRunId,
				updates: {
					status: MigrationRunStatus.Succeeded,
					finished_at: Date.now(),
				},
			});
		}
	},
);
