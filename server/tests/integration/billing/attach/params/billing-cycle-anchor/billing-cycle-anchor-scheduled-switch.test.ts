import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerProductCorrect } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

test(`${chalk.yellowBright("attach scheduled switch with future anchor: activation and reset stay separate")}`, async () => {
	const customerId = "attach-anchor-scheduled-switch";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const { autumnV2_3, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});
	const naturalRenewalMs = addMonths(advancedTo, 1).getTime();
	const scheduledAnchorMs = addDays(advancedTo, 40).getTime();

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		plan_schedule: "end_of_cycle",
		billing_cycle_anchor: scheduledAnchorMs,
	});

	await expectCustomerProductCorrect({
		customerId,
		autumn: autumnV2_3,
		productId: pro.id,
		state: "scheduled",
	});
	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: naturalRenewalMs,
	});
	await expectCustomerProductCorrect({
		customerId,
		autumn: autumnV2_3,
		productId: pro.id,
		state: "active",
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		planId: pro.id,
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
		planId: pro.id,
		nextResetAt: addMonths(scheduledAnchorMs, 1).getTime(),
	});
});
