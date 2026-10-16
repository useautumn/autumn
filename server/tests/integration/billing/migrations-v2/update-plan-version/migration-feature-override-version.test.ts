/**
 * Plan versions carrying a credit_schema feature_override.
 *
 * Contract:
 *   V1 a customer migrated v1 → v2 tracks at v2's override rate
 *   V2 updating a plan with customers to the same override in a different row order is not a new version
 *   V3 updating a plan with customers to an empty override is not a new version
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	CreditSchemaOverrideItem,
	ProductItem,
} from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration.js";

// Catalog Credits schema: Action1 = 0.2, Action2 = 0.6 (see v2Features.ts).

const creditsItem = (schema?: CreditSchemaOverrideItem[]): ProductItem => {
	const item = items.free({
		featureId: TestFeature.Credits,
		includedUsage: 100,
	});
	if (!schema) return item;
	return { ...item, config: { ...item.config, feature_override: { schema } } };
};

const setupAttachedCustomer = async ({
	prefix,
	schema,
}: {
	prefix: string;
	schema?: CreditSchemaOverrideItem[];
}) => {
	const plan = products.base({ id: prefix, items: [creditsItem(schema)] });
	const scenario = await initScenario({
		customerId: uniqueTestId(`${prefix}_cus`),
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	return { ...scenario, planId: plan.id };
};

const latestVersion = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	planId: string;
}) => (await autumn.products.get<{ version: number }>(planId)).version;

const creditsBalance = async ({
	autumn,
	customerId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV3>(customerId);
	return customer.features[TestFeature.Credits]?.balance ?? 0;
};

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: v1 → v2 moves the customer onto v2's override rate")}`,
	async () => {
		const { autumnV1, autumnV2_2, ctx, customerId, planId } =
			await setupAttachedCustomer({
				prefix: "ifo-mig",
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
				],
			});

		await autumnV1.products.update(planId, {
			items: [
				creditsItem([
					{ metered_feature_id: TestFeature.Action1, credit_amount: 2 },
				]),
			],
		});
		expect(await latestVersion({ autumn: autumnV1, planId })).toBe(2);

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: planId } } },
			operations: {
				customer: [
					{ type: "update_plan", plan_filter: { plan_id: planId }, version: 2 },
				],
			},
			runOnServer: false,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			customer.products.find((product) => product.id === planId)?.version,
		).toBe(2);

		const before = await creditsBalance({ autumn: autumnV1, customerId });
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 10,
		});
		const after = await creditsBalance({ autumn: autumnV1, customerId });

		// v2's rate: 10 * 2 = 20 credits (v1 would draw 5, the catalog 2).
		expect(before - after).toBe(20);
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: reordered override rows are not a new version")}`,
	async () => {
		const rate = {
			metered_feature_id: TestFeature.Action1,
			credit_amount: 0.5,
		};
		const excluded = {
			metered_feature_id: TestFeature.Action2,
			excluded: true as const,
		};
		const { autumnV1, planId } = await setupAttachedCustomer({
			prefix: "ifo-ver-order",
			schema: [rate, excluded],
		});

		await autumnV1.products.update(planId, {
			items: [creditsItem([excluded, rate])],
		});
		expect(await latestVersion({ autumn: autumnV1, planId })).toBe(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("plan versioning: an empty override on a plan without one is not a new version")}`,
	async () => {
		const { autumnV1, planId } = await setupAttachedCustomer({
			prefix: "ifo-ver-empty",
		});

		await autumnV1.products.update(planId, { items: [creditsItem([])] });
		expect(await latestVersion({ autumn: autumnV1, planId })).toBe(1);
	},
);
