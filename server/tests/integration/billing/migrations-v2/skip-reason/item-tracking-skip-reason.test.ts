/**
 * withMigrationItemTracking settles the item run's skip_reason for the paths
 * that never reach an operation:
 *   a guard hook skip                     → skipped, ineligible
 *   a real connection drop during the run → failed, so a failed-retry picks it up
 *   a retry that then succeeds            → succeeded, skip_reason cleared
 */

import { expect, test } from "bun:test";
import { connect, createServer, type Socket } from "node:net";
import {
	type FullCustomer,
	MigrationItemKind,
	MigrationItemRunStatus,
	MigrationRunStatus,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import pg from "pg";
import { withMigrationItemTracking } from "@/internal/migrations/v2/actions/migrationItem/withMigrationItemTracking.js";
import { buildSkippedMigrateCustomerResult } from "@/internal/migrations/v2/hooks/index.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/migrateCustomerContext.js";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";
import {
	expectMigrationItemRunStatus,
	getInternalCustomerId,
} from "../batch-migrations/batchTestUtils.js";

/** Runs a slow query through a local TCP proxy, then closes the proxy mid-query. */
const queryThroughDroppedConnection = async () => {
	const target = new URL(process.env.DATABASE_URL ?? "");
	const sockets: Socket[] = [];
	const proxy = createServer((downstream) => {
		const upstream = connect(Number(target.port || 5432), target.hostname);
		sockets.push(downstream, upstream);
		downstream.pipe(upstream).pipe(downstream);
		downstream.on("error", () => {});
		upstream.on("error", () => {});
	});
	await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
	const { port } = proxy.address() as { port: number };
	const client = new pg.Client({
		host: "127.0.0.1",
		port,
		user: decodeURIComponent(target.username),
		password: decodeURIComponent(target.password),
		database: target.pathname.slice(1),
		ssl: target.searchParams.has("sslmode")
			? { servername: target.hostname }
			: false,
	});
	client.on("error", () => {});
	try {
		await client.connect();
		const query = client.query("select pg_sleep(10)");
		setTimeout(() => {
			for (const socket of sockets) socket.end();
		}, 500);
		await query;
	} finally {
		proxy.close();
		for (const socket of sockets) socket.destroy();
	}
	throw new Error("expected the dropped connection to reject the query");
};

test.concurrent(
	`${chalk.yellowBright("item tracking skip reason: guard skips are ineligible, connection drops fail for retry, a retry clears the reason")}`,
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
				run: queryThroughDroppedConnection,
			});
			expect(dropped).toBeUndefined();
			await expectMigrationItemRunStatus({
				...assertion,
				customerId: droppedId,
				status: MigrationItemRunStatus.Failed,
				skipReason: null,
			});

			await withMigrationItemTracking({
				...tracking,
				item: droppedItem,
				retryItemStatuses: ["failed"],
				run: async () => ({
					itemPreview: { id: droppedId, name: null, email: null },
					status: "succeeded" as const,
					response: {},
				}),
			});
			await expectMigrationItemRunStatus({
				...assertion,
				customerId: droppedId,
				status: MigrationItemRunStatus.Succeeded,
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
