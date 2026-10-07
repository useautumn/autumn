// Contract: a per-customer run fanned out over K pipelined lanes migrates every
// matching customer exactly once and settles the run normally.

import { expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";
import { executeRunMigrationLane } from "@/internal/migrations/v2/run/executeRunMigrationLane.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import type { RunMigrationLanePayload } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import { generateId } from "@/utils/genUtils.js";
import { clearMigrationRunHistory } from "../../utils/runChunkedMigration";

const CUSTOMER_COUNT = 7;
const LANE_COUNT = 3;
const SEGMENT_SIZE = 2;

test(`${chalk.yellowBright("pipelined lanes: K lanes migrate every customer exactly once")}`, async () => {
	const suffix = Date.now();
	const customerId = `mig-lanes-${suffix}`;
	const otherIds = Array.from(
		{ length: CUSTOMER_COUNT - 1 },
		(_, i) => `${customerId}-${i}`,
	);
	const allIds = [customerId, ...otherIds];
	const existing = products.base({
		id: `mig-lanes-existing-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const added = products.base({
		id: `mig-lanes-added-${suffix}`,
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

	let lanePayloads: RunMigrationLanePayload[] = [];
	const migrationRunId = generateId("mrun");
	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
		laneCount: LANE_COUNT,
		segmentSize: SEGMENT_SIZE,
		runLanes: async (payloads) => {
			lanePayloads = payloads;
			return Promise.all(
				payloads.map((payload) => executeRunMigrationLane({ ctx, payload })),
			);
		},
	});

	expect(result.lane).toBe("per_customer");
	expect(result.canceled).toBe(false);
	expect(result.processed).toBe(CUSTOMER_COUNT);
	expect(lanePayloads).toHaveLength(LANE_COUNT);
	// 7 customers in segments of 2 → 4 segments dealt round-robin over 3 lanes.
	expect(lanePayloads.map((lane) => lane.segments.length)).toEqual([2, 1, 1]);
	const segments = lanePayloads.flatMap((lane) => lane.segments);
	expect(
		segments.filter((segment) => segment.floor === undefined),
	).toHaveLength(1);

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
