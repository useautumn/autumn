import { expect, test } from "bun:test";
import type { CustomerPlanChange } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getMigrationItemEvents,
	type MigrationItemEvents,
} from "../../../utils/expectMigrationItemEvent";
import { getInternalCustomerId, type ScenarioCtx } from "../../batchTestUtils";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectBatchLane,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

type BatchEventResponse = {
	lane?: string;
	preview?: { plan_changes?: CustomerPlanChange[] } | null;
};

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const getUpdatedEventChange = async ({
	ctx,
	events,
	customerId,
}: {
	ctx: ScenarioCtx;
	events: MigrationItemEvents;
	customerId: string;
}) => {
	const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
	const event = events.find(({ item_id }) => item_id === internalCustomerId);
	expect(event, `Missing item event for ${customerId}`).toBeDefined();
	expect(event?.status).toBe("succeeded");

	const response = event?.response as BatchEventResponse | null;
	expect(response?.lane).toBe("batch");
	expect(response?.preview?.plan_changes).toHaveLength(1);
	const change = response?.preview?.plan_changes?.[0];
	expect(change?.action).toBe("updated");
	expect(change).toBeDefined();
	return change as CustomerPlanChange;
};

// version + customize = pure repoint + customize on the customer's FROM items.
// The event diff must carry the customize delta only, never the catalog v1→v2 delta.
test.concurrent(
	`${chalk.yellowBright("batch version repoint events: version+customize diff shows customize deltas only")}`,
	async () => {
		const stem = uniqueStem("bvr-events-compose");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 25 }),
			],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		// The catalog changes Messages 100→500; the customer must NOT adopt it.
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			items: [
				itemsV2.monthlyMessages({ included: 500 }),
				itemsV2.monthlyWords({ included: 25 }),
			],
		});

		const { migration, migrationRunId, result } =
			await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: {
					customer: { plan: { plan_id: plan.id, version: 1, custom: false } },
				},
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, version: 1, custom: false },
							version: 2,
							customize: {
								add_items: [itemsV2.monthlyCredits({ included: 40 })],
							},
						},
					],
				},
			});
		expectBatchLane({ result });

		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(after.version).toBe(2);
		// Pure repoint: untouched items keep the customer's from-version claims.
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				})
			).balance,
		).toBe(100);
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Credits,
				})
			).balance,
		).toBe(40);

		const events = await getMigrationItemEvents({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			expectedCount: 1,
		});
		if (!events) return;

		const change = await getUpdatedEventChange({ ctx, events, customerId });
		expect(change.subscription).toMatchObject({ plan_id: plan.id });
		expect(change.previous_attributes).toBeNull();
		expect(change.item_changes).toEqual([]);
		// Exactly the customize delta: the Credits add. No Messages 100→500
		// entries — the customer kept its from-version Messages definition.
		expect(change.plan_change?.item_changes).toEqual([
			expect.objectContaining({
				action: "created",
				feature_id: TestFeature.Credits,
				item: expect.objectContaining({ included: 40 }),
			}),
		]);
	},
);
