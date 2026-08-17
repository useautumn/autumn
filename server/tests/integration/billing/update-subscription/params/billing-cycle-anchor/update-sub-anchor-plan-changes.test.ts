import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

test(`${chalk.yellowBright("update-sub scheduled anchor plan changes: same-row and replacement plans retain the target")}`, async () => {
	const customerId = "update-anchor-patch";
	const replacementCustomerId = "update-anchor-replacement";
	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});
	const { autumnV2_3, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([
				{ id: replacementCustomerId, paymentMethod: "success" },
			]),
			s.products({ list: [pro] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					customerId: replacementCustomerId,
					productId: pro.id,
				}),
			),
		],
	});
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
		billing_cycle_anchor: scheduledAnchorMs,
	});
	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: replacementCustomerId,
		plan_id: pro.id,
		customize: {
			items: [itemsV2.monthlyMessages({ included: 200 })],
			price: itemsV2.monthlyPrice({ amount: 30 }),
		},
		billing_cycle_anchor: scheduledAnchorMs,
	});

	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});
	await expectBalanceCorrect({
		customerId: replacementCustomerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});
});
