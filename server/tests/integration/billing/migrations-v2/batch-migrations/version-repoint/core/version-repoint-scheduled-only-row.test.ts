import { expect, test } from "bun:test";
import { CusProductStatus, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

test.concurrent(
	`${chalk.yellowBright("batch version repoint: a scheduled-only row repoints in place with its future start preserved")}`,
	async () => {
		const stem = uniqueStem("bvr-scheduled-only");
		const customerId = `${stem}-customer`;
		const current = products.base({
			id: `${stem}-current`,
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const future = products.base({
			id: `${stem}-future`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [current, future] }),
			],
			actions: [],
		});

		// The customer holds ONLY a future-start row on the target plan; the
		// active row belongs to a different plan the migration never touches.
		const now = Date.now();
		await autumnV2_3.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: current.id }] },
				{ starts_at: now + ms.days(30), plans: [{ plan_id: future.id }] },
			],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: future.id,
		});
		expect(before.status).toBe(CusProductStatus.Scheduled);
		expect(before.startsAt).toBeGreaterThan(now);

		await autumnV2_3.post("/plans.update", {
			plan_id: future.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: { plan_id: future.id, version: 1, custom: false },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: future.id, custom: false },
						version: 2,
					},
				],
			},
		});
		expectBatchLane({ result });

		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: future.id,
		});
		expectCustomerPlanRepointedInPlace({ before, after, targetVersion: 2 });
		expect(after.status).toBe(CusProductStatus.Scheduled);
		expect(after.startsAt).toBe(before.startsAt);
		expect(
			await readCustomerPlanRows({ ctx, customerId, planId: future.id }),
		).toHaveLength(1);
	},
);
