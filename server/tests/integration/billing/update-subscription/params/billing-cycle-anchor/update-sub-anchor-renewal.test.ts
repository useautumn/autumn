import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

test(`${chalk.yellowBright("update-sub scheduled anchor renewal: natural renewal stops at pending reset")}`, async () => {
	const customerId = "update-anchor-after-renewal";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const naturalRenewalMs = addMonths(advancedTo, 1).getTime();
	const scheduledAnchorMs = addDays(advancedTo, 40).getTime();

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		nextResetAt: naturalRenewalMs,
	});
	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: naturalRenewalMs,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		nextResetAt: scheduledAnchorMs,
	});
	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo: naturalRenewalMs,
		anchorMs: scheduledAnchorMs,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		nextResetAt: addMonths(scheduledAnchorMs, 1).getTime(),
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 3 });
});
