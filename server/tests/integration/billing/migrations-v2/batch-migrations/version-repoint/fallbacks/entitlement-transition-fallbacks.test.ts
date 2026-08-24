import { test } from "bun:test";
import {
	type CreatePlanItemParamsV1Input,
	type ProductV2,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	expectPerCustomerLaneWithRejections,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

// Plan versions accumulate across runs, so every test mints its own plan id to
// keep `version: 2` deterministic.
const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

type EntitlementFallbackCase = {
	name: string;
	code:
		| "rollover_remove_item"
		| "entity_scoped_entitlement"
		| "pooled_add_item"
		| "paid_entitlement_transition";
	fromItems: ProductV2["items"];
	toItems: CreatePlanItemParamsV1Input[];
	withEntities?: boolean;
};

const rollover = (included: number) => ({
	...items.monthlyCredits({
		includedUsage: included,
		rolloverConfig: {
			max: 500,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		},
	}),
});

const rolloverV2 = (included: number): CreatePlanItemParamsV1Input => ({
	...itemsV2.monthlyCredits({ included }),
	rollover: {
		max: 500,
		expiry_duration_type: RolloverExpiryDurationType.Month,
		expiry_duration_length: 1,
	},
});

const entityMessages = (included: number) =>
	items.monthlyMessages({
		includedUsage: included,
		entityFeatureId: TestFeature.Users,
	});

const entityMessagesV2 = (included: number): CreatePlanItemParamsV1Input => ({
	...itemsV2.monthlyMessages({ included }),
	entity_feature_id: TestFeature.Users,
});

const pooledCredits = (included: number) => ({
	...items.monthlyCredits({ includedUsage: included }),
	entity_feature_id: TestFeature.Users,
	pooled: true,
});

const pooledCreditsV2 = (included: number): CreatePlanItemParamsV1Input => ({
	...itemsV2.monthlyCredits({ included }),
	entity_feature_id: TestFeature.Users,
	pooled: true,
});

const fallbackCases: EntitlementFallbackCase[] = [
	{
		name: "rollover definition transition",
		code: "rollover_remove_item",
		fromItems: [rollover(100)],
		toItems: [rolloverV2(200)],
	},
	{
		name: "entity-scoped definition transition",
		code: "entity_scoped_entitlement",
		fromItems: [entityMessages(100)],
		toItems: [entityMessagesV2(200)],
		withEntities: true,
	},
	{
		name: "pooled definition transition",
		code: "pooled_add_item",
		fromItems: [pooledCredits(100)],
		toItems: [pooledCreditsV2(200)],
		withEntities: true,
	},
	{
		name: "one-off prepaid transition preserves per-customer carry-over",
		code: "paid_entitlement_transition",
		fromItems: [items.oneOffMessages({ price: 10, includedUsage: 100 })],
		toItems: [itemsV2.oneOffPrepaidMessages({ amount: 10, included: 200 })],
	},
];

for (const [index, scenario] of fallbackCases.entries()) {
	test.skip(
		`${chalk.yellowBright(`batch version repoint entitlement ${index + 1}: ${scenario.name}`)}`,
		async () => {
			const id = uniqueStem(`batch-vr-ent-${index + 1}`);
			const customerId = `${id}-customer`;
			const plan = products.base({
				id: `${id}-plan`,
				items: scenario.fromItems,
			});
			const { autumnV2_3, ctx } = await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: false, paymentMethod: "success" }),
					s.products({ list: [plan] }),
					...(scenario.withEntities
						? [s.entities({ count: 1, featureId: TestFeature.Users })]
						: []),
				],
				actions: [s.billing.attach({ productId: plan.id })],
			});

			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: scenario.toItems,
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${id}-migration`,
				filter: {
					customer: {
						plan: { plan_id: plan.id, version: 1, custom: false },
					},
				},
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, custom: false },
							version: 2,
						},
					],
				},
			});

			expectPerCustomerLaneWithRejections({
				result,
				codes: [scenario.code],
			});
		},
	);
}

const freeTransitionCases = [
	{
		name: "free entitlement add",
		fromItems: [items.dashboard()],
		toItems: [itemsV2.dashboard(), itemsV2.monthlyMessages({ included: 100 })],
	},
	{
		name: "free entitlement remove",
		fromItems: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		toItems: [itemsV2.dashboard()],
	},
	{
		name: "free entitlement replace",
		fromItems: [items.monthlyMessages({ includedUsage: 100 })],
		toItems: [itemsV2.monthlyMessages({ included: 200 })],
	},
] satisfies {
	name: string;
	fromItems: ProductV2["items"];
	toItems: CreatePlanItemParamsV1Input[];
}[];

for (const [index, scenario] of freeTransitionCases.entries()) {
	test.skip(
		`${chalk.yellowBright(`batch version repoint control ${index + 1}: ${scenario.name} batches`)}`,
		async () => {
			const id = uniqueStem(`batch-vr-free-${index + 1}`);
			const customerId = `${id}-customer`;
			const plan = products.base({
				id: `${id}-plan`,
				items: scenario.fromItems,
			});
			const { autumnV2_3, ctx } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.billing.attach({ productId: plan.id })],
			});
			const before = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});

			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: scenario.toItems,
			});
			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${id}-migration`,
				filter: {
					customer: {
						plan: { plan_id: plan.id, version: 1, custom: false },
					},
				},
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, custom: false },
							version: 2,
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
			expectCustomerPlanRepointedInPlace({
				before,
				after,
				targetVersion: 2,
			});
		},
	);
}
