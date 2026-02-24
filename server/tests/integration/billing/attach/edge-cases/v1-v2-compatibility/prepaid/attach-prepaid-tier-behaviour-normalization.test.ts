import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	ErrCode,
	type UpdatePlanParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const MULTI_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];
const ATTACH_QUANTITY = 800;

test.concurrent(`${chalk.yellowBright("attach-prepaid: omitted tier_behaviour should not create v2")}`, async () => {
	const customerId = "attach-tier-behaviour-versioning";

	const product = products.base({
		id: "tier-behaviour-versioning-product",
		items: [
			items.tieredPrepaidMessages({
				includedUsage: 0,
				billingUnits: BILLING_UNITS,
				tiers: MULTI_TIERS,
			}),
		],
	});

	const { autumnV1, autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: ATTACH_QUANTITY },
				],
			}),
		],
	});

	// Baseline: there is no v2 yet.
	await expectAutumnError({
		errCode: ErrCode.ProductNotFound,
		func: async () => {
			await autumnV1.subscriptions.previewUpdate({
				customer_id: customerId,
				product_id: product.id,
				version: 2,
			});
		},
	});

	// No-op update through V2 plan schema, intentionally omitting tier_behaviour.
	await autumnV2.products.update<unknown, UpdatePlanParamsInput>(product.id, {
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 0,
				price: {
					tiers: MULTI_TIERS,
					interval: BillingInterval.Month,
					billing_units: BILLING_UNITS,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
	});

	// Expected behavior: still no v2 for a semantic no-op.
	await expectAutumnError({
		errCode: ErrCode.ProductNotFound,
		func: async () => {
			await autumnV1.subscriptions.previewUpdate({
				customer_id: customerId,
				product_id: product.id,
				version: 2,
			});
		},
	});

	const currentVersionPreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		version: 1,
	});

	expect(currentVersionPreview.total).toBe(0);
});
