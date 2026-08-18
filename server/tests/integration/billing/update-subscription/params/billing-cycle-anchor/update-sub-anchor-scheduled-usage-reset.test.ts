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

test(`${chalk.yellowBright("update-sub scheduled anchor usage reset: usage clears now and timing moves to target")}`, async () => {
	const customerId = "update-anchor-future-usage";
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
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();
	await autumnV2_3.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		},
		{ timeout: 2000 },
	);

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
		billing_cycle_anchor: scheduledAnchorMs,
		carry_over_usages: { enabled: false },
	});

	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		planId: pro.id,
		remaining: 100,
		usage: 0,
		nextResetAt: scheduledAnchorMs,
	});
});
