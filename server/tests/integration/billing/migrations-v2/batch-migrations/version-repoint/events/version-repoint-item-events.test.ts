import { expect, test } from "bun:test";
import type { CustomerPlanChange } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanChangeFromFullProducts";
import { ProductService } from "@/internal/products/ProductService";
import {
	getMigrationItemEvents,
	type MigrationItemEvents,
} from "../../../utils/expectMigrationItemEvent";
import { getInternalCustomerId, type ScenarioCtx } from "../../batchTestUtils";
import {
	expectBatchLane,
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

test.skip(
	`${chalk.yellowBright("batch version repoint events: every customer receives the canonical plan diff")}`,
	async () => {
		const stem = uniqueStem("bvr-events-canonical");
		const customerIds = [`${stem}-a`, `${stem}-b`];
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId: customerIds[0],
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: customerIds[1] }]),
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
			items: [itemsV2.monthlyMessages({ included: 200 }), itemsV2.dashboard()],
		});
		const [from, to] = await Promise.all(
			[1, 2].map((version) =>
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: plan.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version,
				}),
			),
		);
		const expectedPlanChange = buildPlanChangeFromFullProducts({ from, to });
		expect(expectedPlanChange).toBeDefined();
		if (!expectedPlanChange) {
			throw new Error("Expected a catalog plan change between v1 and v2");
		}

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
							plan_filter: {
								plan_id: plan.id,
								version: 1,
								custom: false,
							},
							version: 2,
						},
					],
				},
			});
		expectBatchLane({ result });

		const events = await getMigrationItemEvents({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			expectedCount: customerIds.length,
		});
		if (!events) return;

		for (const customerId of customerIds) {
			const change = await getUpdatedEventChange({ ctx, events, customerId });
			expect(change.subscription).toMatchObject({ plan_id: plan.id });
			expect(change.previous_attributes).toBeNull();
			expect(change.item_changes).toEqual([]);
			expect(change.plan_change?.previous_attributes).toEqual(
				expectedPlanChange.previous_attributes,
			);
			expect(change.plan_change?.price_change).toEqual(
				expectedPlanChange.price_change,
			);
			expect(change.plan_change?.free_trial_change).toEqual(
				expectedPlanChange.free_trial_change,
			);
			expect(change.plan_change?.item_changes).toEqual([
				expect.objectContaining({
					action: "deleted",
					feature_id: TestFeature.Messages,
					item: expect.objectContaining({ included: 100 }),
				}),
				expect.objectContaining({
					action: "created",
					feature_id: TestFeature.Messages,
					item: expect.objectContaining({ included: 200 }),
				}),
				expect.objectContaining({
					action: "created",
					feature_id: TestFeature.Dashboard,
				}),
			]);
		}
	},
);

test.skip(
	`${chalk.yellowBright("batch version repoint events: identical versions retain the repoint lifecycle")}`,
	async () => {
		const stem = uniqueStem("bvr-events-identical");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 101 })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const [from, to] = await Promise.all(
			[1, 3].map((version) =>
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: plan.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version,
				}),
			),
		);
		expect(buildPlanChangeFromFullProducts({ from, to })).toBeUndefined();

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
							plan_filter: {
								plan_id: plan.id,
								version: 1,
								custom: false,
							},
							version: 3,
						},
					],
				},
			});
		expectBatchLane({ result });

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
		// Rows were repointed onto identical definitions — no content changed,
		// so there is no plan change to report (same as the per-customer lane).
		expect(change.plan_change).toBeUndefined();
	},
);
