import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe-checkout: prepaid volume: flat_amount only")}`, async () => {
	const customerId = "stripe-cko-prepaid-volume-flat";
	const quantity = 50;

	// Tier 1: 0-100 → $0/unit, $20 flat. Tier 2: 101+ → $0/unit, $50 flat.
	// 50 units → falls in tier 1 → 50 × $0 + $20 = $20
	const expectedTotal = 20;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: 100, amount: 0, flat_amount: 20 },
			{ to: "inf", amount: 0, flat_amount: 50 },
		],
	});

	const product = products.base({
		id: "vol-flat-only",
		items: [volumeItem],
	});

	const { autumnV2 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [product] })],
		actions: [],
	});

	const result = await autumnV2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: product.id,
		redirect_mode: "if_required",
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity }],
	});

	console.log(result);
});
