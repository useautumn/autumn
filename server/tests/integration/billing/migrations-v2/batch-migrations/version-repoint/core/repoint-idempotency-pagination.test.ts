import { expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { expectMigrationItemRunStatus } from "../../batchTestUtils";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

// Plan versions accumulate across runs, so every test mints its own plan id to
// keep `version: 2` deterministic.
const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

test.skip(
	`${chalk.yellowBright("batch version repoint replay: rerunning an applied migration is idempotent")}`,
	async () => {
		const stem = uniqueStem("bvr-replay-idempotent");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		const migrationArgs = {
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan" as const,
						plan_filter: { plan_id: plan.id },
						version: 2,
					},
				],
			},
		};

		const first = await runVersionRepointMigration(migrationArgs);
		expectBatchLane({ result: first.result });
		const afterFirst = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expectCustomerPlanRepointedInPlace({
			before,
			after: afterFirst,
			targetVersion: 2,
		});
		expect(
			await readCustomerPlanRows({ ctx, customerId, planId: plan.id }),
		).toHaveLength(1);

		const second = await runVersionRepointMigration(migrationArgs);
		expectBatchLane({ result: second.result });
		expect(
			await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			}),
		).toEqual(afterFirst);
		expect(
			await readCustomerPlanRows({ ctx, customerId, planId: plan.id }),
		).toHaveLength(1);
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint pagination: several customers are each repointed exactly once")}`,
	async () => {
		const stem = uniqueStem("bvr-pagination");
		const customerIds = Array.from(
			{ length: 7 },
			(_, index) => `${stem}-customer-${index + 1}`,
		);
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId: customerIds[0],
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(customerIds.slice(1).map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		await Promise.all(
			customerIds.map((customerId) =>
				autumnV2_3.billing.attach({
					customer_id: customerId,
					plan_id: plan.id,
				}),
			),
		);
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		const before = new Map(
			await Promise.all(
				customerIds.map(
					async (customerId) =>
						[
							customerId,
							await readRepointableCustomerPlanRow({
								ctx,
								customerId,
								planId: plan.id,
							}),
						] as const,
				),
			),
		);

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, version: 1 },
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });
		for (const customerId of customerIds) {
			const after = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});
			expectCustomerPlanRepointedInPlace({
				before: before.get(customerId)!,
				after,
				targetVersion: 2,
			});
			expect(
				await readCustomerPlanRows({ ctx, customerId, planId: plan.id }),
			).toHaveLength(1);
		}
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint: a true no-op skips while a changed customer succeeds")}`,
	async () => {
		const stem = uniqueStem("bvr-mixed-noop");
		const changedCustomerId = `${stem}-changed-customer`;
		const noOpCustomerId = `${stem}-target-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId: changedCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: noOpCustomerId }]),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		await autumnV2_3.billing.attach({
			customer_id: noOpCustomerId,
			plan_id: plan.id,
			version: 2,
		});
		const changedBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId: changedCustomerId,
			planId: plan.id,
		});
		const noOpBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId: noOpCustomerId,
			planId: plan.id,
		});

		const run = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result: run.result });
		const changedAfter = await readRepointableCustomerPlanRow({
			ctx,
			customerId: changedCustomerId,
			planId: plan.id,
		});
		expectCustomerPlanRepointedInPlace({
			before: changedBefore,
			after: changedAfter,
			targetVersion: 2,
		});
		expect(
			await readRepointableCustomerPlanRow({
				ctx,
				customerId: noOpCustomerId,
				planId: plan.id,
			}),
		).toEqual(noOpBefore);
		for (const customerId of [changedCustomerId, noOpCustomerId]) {
			expect(
				await readCustomerPlanRows({ ctx, customerId, planId: plan.id }),
			).toHaveLength(1);
		}
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: run.migration.internal_id,
			migrationRunId: run.migrationRunId,
			customerId: changedCustomerId,
			status: MigrationItemRunStatus.Succeeded,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: run.migration.internal_id,
			migrationRunId: run.migrationRunId,
			customerId: noOpCustomerId,
			status: MigrationItemRunStatus.Skipped,
		});
	},
);
