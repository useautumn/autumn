import { test } from "bun:test";
import type {
	ApiEntityV2,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

test(`${chalk.yellowBright("update-sub scheduled anchor 1: anchor-only update schedules a future reset")}`, async () => {
	const customerId = "update-sub-anchor-future";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_3, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
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
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("update-sub scheduled anchor 2: rescheduling a shared subscription replaces the old target")}`, async () => {
	const customerId = "update-sub-anchor-shared-reschedule";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx, entities, advancedTo, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});
	const oldAnchorMs = addDays(advancedTo, 10).getTime();
	const replacementAnchorMs = addDays(advancedTo, 20).getTime();

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: pro.id,
		billing_cycle_anchor: oldAnchorMs,
	});
	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		entity_id: entities[1].id,
		plan_id: pro.id,
		billing_cycle_anchor: replacementAnchorMs,
	});

	for (const entity of entities) {
		const customerEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entity.id,
		);
		expectBalanceCorrect({
			customer: customerEntity,
			featureId: TestFeature.Messages,
			planId: pro.id,
			nextResetAt: replacementAnchorMs,
		});
	}

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: oldAnchorMs,
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo: oldAnchorMs,
		anchorMs: replacementAnchorMs,
	});
	for (const entity of entities) {
		const customerEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entity.id,
		);
		expectBalanceCorrect({
			customer: customerEntity,
			featureId: TestFeature.Messages,
			planId: pro.id,
			nextResetAt: addMonths(replacementAnchorMs, 1).getTime(),
		});
	}
	await expectCustomerInvoiceCorrect({ customerId, count: 3 });
});
