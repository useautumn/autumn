/**
 * Regression: attach PATCH-style customize (remove + add) can reshape an item's
 * full config — included amount, price/tiers, and billing behavior (billing_method).
 *
 * Green-success criteria (post-fix):
 *  - remove_items + add_items replaces a plan item, applying the new included usage,
 *    the new price/tiers (reflected in the invoice total), and the new billing_method.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	BillingInterval,
	BillingMethod,
	ResetInterval,
	TierInfinite,
} from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach patch config: customize included credits via remove/add")}`, async () => {
	const customerId = "attach-patch-config-credits";

	const scale = products.base({
		id: "scale",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyCredits({ includedUsage: 100 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [scale] }),
		],
		actions: [],
	});

	const attachParams: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: scale.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Credits }],
			add_items: [
				{
					feature_id: TestFeature.Credits,
					included: 500,
					reset: { interval: ResetInterval.Month },
				},
			],
		},
	};

	// Included amount change only — base price unchanged.
	const preview =
		await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(attachParams);
	expect(preview.total).toBe(20);

	await autumnV2_2.billing.attach<AttachParamsV1Input>(attachParams);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: scale.id });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 500,
		usage: 0,
		planId: scale.id,
	});
});

test.concurrent(`${chalk.yellowBright("attach patch config: customize price/tiers via remove/add")}`, async () => {
	const customerId = "attach-patch-config-tiers";

	const scale = products.base({
		id: "scale",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [scale] }),
		],
		actions: [],
	});

	// Replace the flat $10/100 prepaid with a graduated tiered price.
	const attachParams: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: scale.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				itemsV2.tieredPrepaidMessages({
					included: 0,
					billingUnits: 100,
					tiers: [
						{ to: 300, amount: 6 },
						{ to: TierInfinite, amount: 3 },
					],
				}),
			],
		},
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 500 }],
	};

	// 5 packs of 100: 3 packs @ $6 ($18) + 2 packs @ $3 ($6) = $24, + $20 base = $44.
	const preview =
		await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(attachParams);
	expect(preview.total).toBe(44);

	await autumnV2_2.billing.attach<AttachParamsV1Input>(attachParams);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: scale.id });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 500,
		usage: 0,
		planId: scale.id,
	});
});

test.concurrent(`${chalk.yellowBright("attach patch config: customize billing behavior via remove/add")}`, async () => {
	const customerId = "attach-patch-config-billing-behavior";

	// Original item is prepaid (must buy packs upfront).
	const scale = products.base({
		id: "scale",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [scale] }),
		],
		actions: [],
	});

	// Swap prepaid -> usage-based with included: no upfront pack charge.
	const attachParams: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: scale.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				{
					feature_id: TestFeature.Messages,
					included: 100,
					price: {
						amount: 0.1,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
				},
			],
		},
	};

	// Usage-based -> only the base price is charged now (billing behavior changed).
	const preview =
		await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(attachParams);
	expect(preview.total).toBe(20);

	await autumnV2_2.billing.attach<AttachParamsV1Input>(attachParams);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductActive({ customer, productId: scale.id });
	await expectCustomerProducts({ customer, active: [scale.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: scale.id,
	});
});
