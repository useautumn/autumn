import { afterAll, beforeAll, expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	CheckResponseV3,
	CustomerPlanChange,
} from "@autumn/shared";
import { waitForBillingUpdatedWebhook } from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook";
import { waitForProductsUpdatedWebhook } from "@tests/integration/billing/autumn-webhooks/utils/expectProductsUpdatedWebhook";
import {
	getTestSvixAppId,
	setupWebhookTest,
	type WebhookTestSetup,
} from "@tests/integration/utils/svixWebhookTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getMigrationItemEvents,
	type MigrationItemEvents,
} from "../../../utils/expectMigrationItemEvent";
import { runChunkedMigration } from "../../../utils/runChunkedMigration";
import { getInternalCustomerId, type ScenarioCtx } from "../../batchTestUtils";
import {
	readScopedFeatureRow,
	repointToCustomEntitlement,
} from "../../paidRowTestUtils";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

type BatchEventResponse = {
	preview?: { plan_changes?: CustomerPlanChange[] } | null;
};

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const findEventPlanChange = async ({
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
	expect(event?.status).toBe("succeeded");
	const response = event?.response as BatchEventResponse | null;
	const change = response?.preview?.plan_changes?.[0];
	expect(change?.action).toBe("updated");
	expect(change).toBeDefined();
	return change as CustomerPlanChange;
};

let webhook: WebhookTestSetup;

beforeAll(async () => {
	webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated", "customer.products.updated"],
	});
});

afterAll(async () => {
	await webhook?.cleanup();
});

test.concurrent(
	`${chalk.yellowBright("batch version repoint webhooks: event and webhook payloads share the composed target diff")}`,
	async () => {
		const stem = uniqueStem("bvr-webhooks-composed");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 25 }),
			],
		});
		const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
		});
		const preservedBefore = await readScopedFeatureRow({
			ctx: scenarioCtx,
			customerId,
			featureId: TestFeature.Words,
		});
		await repointToCustomEntitlement({
			ctx: scenarioCtx,
			customerId,
			featureId: TestFeature.Words,
		});
		const preservedCustom = await readScopedFeatureRow({
			ctx: scenarioCtx,
			customerId,
			featureId: TestFeature.Words,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 }), itemsV2.dashboard()],
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx: scenarioCtx,
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
						customize: {
							remove_items: [{ feature_id: TestFeature.Dashboard }],
							add_items: [itemsV2.monthlyCredits({ included: 40 })],
						},
					},
				],
			},
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: true } },
		});
		expectBatchLane({ result });

		const [events, billingUpdated, productsUpdated] = await Promise.all([
			getMigrationItemEvents({
				ctx: scenarioCtx,
				migrationInternalId: migration.internal_id,
				migrationRunId,
				expectedCount: 1,
			}),
			waitForBillingUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
			}),
			waitForProductsUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				scenario: "new",
				planId: plan.id,
				planVersion: 2,
			}),
		]);
		expect(events).not.toBeNull();
		if (!events) return;

		const eventChange = await findEventPlanChange({
			ctx: scenarioCtx,
			events,
			customerId,
		});
		const billingChange = billingUpdated?.plan_changes?.[0];
		expect(billingChange).toEqual(eventChange);
		expect(eventChange.subscription).toMatchObject({ plan_id: plan.id });
		expect(eventChange.item_changes).toEqual([]);
		expect(eventChange.previous_attributes).toBeNull();

		const itemChanges = eventChange.plan_change?.item_changes ?? [];
		// Customize makes the version a pure repoint: only the added credits row
		// is applied; Messages keeps its v1 definition as a grandfathered claim.
		expect(itemChanges).toEqual([
			expect.objectContaining({
				action: "created",
				feature_id: TestFeature.Credits,
			}),
		]);

		expect(productsUpdated).not.toBeNull();
		expect(productsUpdated?.customer.id).toBe(customerId);
		expect(productsUpdated?.updated_product).toMatchObject({
			id: plan.id,
			version: 2,
		});
		expect(
			productsUpdated?.customer.features?.[TestFeature.Words],
		).toBeDefined();
		expect(
			productsUpdated?.customer.features?.[TestFeature.Credits],
		).toMatchObject({
			balance: 40,
		});

		const preservedAfter = await readScopedFeatureRow({
			ctx: scenarioCtx,
			customerId,
			featureId: TestFeature.Words,
		});
		expect(preservedAfter.id).toBe(preservedBefore.id);
		expect(preservedAfter.entitlement_id).toBe(preservedCustom.entitlement_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint webhooks: sendWebhooks false suppresses both deliveries")}`,
	async () => {
		const stem = uniqueStem("bvr-webhooks-disabled");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, skipWebhooks: true }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx: scenarioCtx,
			customerId,
			planId: plan.id,
		});

		const { result } = await runChunkedMigration({
			ctx: scenarioCtx,
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
			noBillingChanges: true,
			controls: { webhooks: { sendWebhooks: false } },
		});
		expectBatchLane({ result });

		const after = await readRepointableCustomerPlanRow({
			ctx: scenarioCtx,
			customerId,
			planId: plan.id,
		});
		expectCustomerPlanRepointedInPlace({
			before,
			after,
			targetVersion: 2,
		});
		const [billingUpdated, productsUpdated] = await Promise.all([
			waitForBillingUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				timeoutMs: 4_000,
			}),
			waitForProductsUpdatedWebhook({
				playToken: webhook.playToken,
				customerId,
				planId: plan.id,
				planVersion: 2,
				timeoutMs: 4_000,
			}),
		]);
		expect(billingUpdated).toBeNull();
		expect(productsUpdated).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint cache: repoint-only changes invalidate primed customer state")}`,
	async () => {
		const stem = uniqueStem("bvr-cache-repoint-only");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx: scenarioCtx } = await initScenario({
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
			items: [itemsV2.monthlyMessages({ included: 100 }), itemsV2.dashboard()],
		});

		const before = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(before.allowed).toBe(false);
		await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

		const { result } = await runVersionRepointMigration({
			ctx: scenarioCtx,
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

		const after = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(after.allowed).toBe(true);
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.flags[TestFeature.Dashboard]).toBeDefined();
	},
);
