// Contract: a per-customer run fanned out over P concurrent keyset segments
// migrates every matching customer exactly once and settles the run normally.

import { expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { executeRunMigrationChunk } from "@/internal/migrations/v2/run/executeRunMigrationChunk.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import { clearMigrationRunHistory } from "../../utils/runChunkedMigration";

const CUSTOMER_COUNT = 7;

test(`${chalk.yellowBright("concurrent chunks: P segments migrate every customer exactly once")}`, async () => {
	const suffix = Date.now();
	const customerId = `mig-segments-${suffix}`;
	const otherIds = Array.from(
		{ length: CUSTOMER_COUNT - 1 },
		(_, i) => `${customerId}-${i}`,
	);
	const allIds = [customerId, ...otherIds];
	const existing = products.base({
		id: `mig-segments-existing-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const added = products.base({
		id: `mig-segments-added-${suffix}`,
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

	const roundSizes: number[] = [];
	const migrationRunId = generateId("mrun");
	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
		partitions: 3,
		segmentSize: 2,
		runChunkRound: async (payloads) => {
			roundSizes.push(payloads.length);
			return Promise.all(
				payloads.map((payload) => executeRunMigrationChunk({ ctx, payload })),
			);
		},
	});

	expect(result.lane).toBe("per_customer");
	expect(result.canceled).toBe(false);
	expect(result.processed).toBe(CUSTOMER_COUNT);
	expect(Math.max(...roundSizes)).toBe(3);

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
