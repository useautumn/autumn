import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// version-only is per-customer until definition execute is restored
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectPerCustomerLaneWithRejections,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const BILLING_UNITS = 100;
const PURCHASED_QUANTITY = 200;
// customer_products.options stores quantity in billing-unit packs.
const PURCHASED_PACKS = PURCHASED_QUANTITY / BILLING_UNITS;

test.skip(
	`${chalk.yellowBright("batch version repoint prepaid fallback: a prepaid transition rejects and lands per-customer with quantity preserved")}`,
	async () => {
		const stem = uniqueStem("bvr-prepaid-fallback");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.prepaidMessages({
					includedUsage: 0,
					billingUnits: BILLING_UNITS,
					price: 10,
				}),
			],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: PURCHASED_QUANTITY },
					],
				}),
			],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(before.options).toMatchObject([
			{ feature_id: TestFeature.Messages, quantity: PURCHASED_PACKS },
		]);

		// The target version re-prices the prepaid item; the op carries no
		// quantity strategy, so the transition cannot batch-lower.
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [
				itemsV2.prepaidMessages({
					included: 0,
					billingUnits: BILLING_UNITS,
					amount: 12,
				}),
			],
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
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
			codes: ["paid_entitlement_transition"],
		});

		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(after.version).toBe(2);
		expect(after.options).toMatchObject([
			{ feature_id: TestFeature.Messages, quantity: PURCHASED_PACKS },
		]);
		const featureRow = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(featureRow.balance).toBe(PURCHASED_QUANTITY);
	},
);
