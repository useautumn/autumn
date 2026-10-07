// Contract: a per-customer run keeps K fixed-page chunks in flight and migrates
// every matching customer exactly once.

import { expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { createInProcessChunkDispatcher } from "@/internal/migrations/v2/run/chunks/createInProcessChunkDispatcher.js";
import { executeRunMigrationChunk } from "@/internal/migrations/v2/run/executeRunMigrationChunk.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import type { RunMigrationChunkPayload } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import { generateId } from "@/utils/genUtils.js";
import { clearMigrationRunHistory } from "../../utils/runChunkedMigration";

const CUSTOMER_COUNT = 7;
const CHUNK_SIZE = 2;
const CHUNK_CONCURRENCY = 3;

test(`${chalk.yellowBright("concurrent chunks: K fixed-page chunks migrate every customer exactly once")}`, async () => {
	const suffix = Date.now();
	const customerId = `mig-chunks-${suffix}`;
	const otherIds = Array.from(
		{ length: CUSTOMER_COUNT - 1 },
		(_, i) => `${customerId}-${i}`,
	);
	const allIds = [customerId, ...otherIds];
	const existing = products.base({
		id: `mig-chunks-existing-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const added = products.base({
		id: `mig-chunks-added-${suffix}`,
		items: [items.dashboard()],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers(otherIds.map((id) => ({ id }))),
			s.products({ list: [existing, added] }),
		],
		actions: allIds.map((id) =>
			s.billing.attach({ customerId: id, productId: existing.id }),
		),
	});

	const migrationId = `${customerId}-mig`;
	await clearMigrationRunHistory({ ctx, migrationId });
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter: { customer: { plan: { plan_id: existing.id } } },
		operations: { customer: [{ type: "add_plan", plan_id: added.id }] },
	});

	const chunks: RunMigrationChunkPayload[] = [];
	let inFlight = 0;
	let peakInFlight = 0;
	const migrationRunId = generateId("mrun");
	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
		chunkSize: CHUNK_SIZE,
		chunkConcurrency: CHUNK_CONCURRENCY,
		dispatcher: createInProcessChunkDispatcher({
			runChunk: async (payload) => {
				chunks.push(payload);
				peakInFlight = Math.max(peakInFlight, ++inFlight);
				try {
					return await executeRunMigrationChunk({ ctx, payload });
				} finally {
					inFlight--;
				}
			},
		}),
	});

	expect(result).toMatchObject({
		lane: "per_customer",
		canceled: false,
		processed: CUSTOMER_COUNT,
		chunks: 4,
	});
	expect(peakInFlight).toBe(CHUNK_CONCURRENCY);
	expect(chunks.map((chunk) => chunk.customers.length)).toEqual([2, 2, 2, 1]);
	expect(chunks.every((chunk) => chunk.attempt === 1)).toBe(true);

	const itemRuns = await Promise.all(
		allIds.map(async (id) => {
			const customer = await CusService.get({
				db: ctx.db,
				idOrInternalId: id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			if (!customer) throw new Error(`missing customer ${id}`);
			return migrationItemRunRepo.getCustomer({
				ctx,
				migrationInternalId: migration.internal_id,
				internalCustomerId: customer.internal_id,
			});
		}),
	);
	expect(
		itemRuns.map((itemRun) => [itemRun?.status, itemRun?.migration_run_id]),
	).toEqual(
		allIds.map(() => [MigrationItemRunStatus.Succeeded, migrationRunId]),
	);
});
