import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	AttachParamsV1Input,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

/**
 * Billing Cycle Anchor — New Plan Entity Tests
 *
 * Entity 1 already has pro. We attach pro to entity 2 with billing_cycle_anchor
 * in various configurations (free->pro scheduled, no-plan->pro, free->pro now).
 */

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-new-plan-entities 1: ent2 free -> pro, scheduled anchor")}`, async () => {
	const customerId = "anchor-new-ent-free-pro-sched";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, entities, ctx, advancedTo, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: free.id, entityIndex: 1 }),
			],
		});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		entity_id: entities[1].id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	expect(preview.total).toBe(20);

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		entity_id: entities[1].id,
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: pro.id });
	expectBalanceCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	const entity2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: pro.id });
	await expectProductNotPresent({ customer: entity2, productId: free.id });
	expectBalanceCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 20,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const entity2AfterReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2AfterReset,
		productId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity2AfterReset,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-new-plan-entities 2: ent2 no plan -> pro, scheduled anchor")}`, async () => {
	const customerId = "anchor-new-ent-none-pro-sched";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, entities, ctx, advancedTo, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
		});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		entity_id: entities[1].id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	expect(preview.total).toBe(20);

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		entity_id: entities[1].id,
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: pro.id });
	expectBalanceCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	const entity2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: pro.id });
	expectBalanceCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 20,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const entity2AfterReset = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2AfterReset,
		productId: pro.id,
	});
	expectBalanceCorrect({
		customer: entity2AfterReset,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-new-plan-entities 3: ent2 free -> pro, anchor now")}`, async () => {
	const customerId = "anchor-new-ent-free-pro-now";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, entities, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: free.id, entityIndex: 1 }),
		],
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		entity_id: entities[1].id,
		billing_cycle_anchor: "now",
	});

	expect(preview.total).toBe(20);
	expectPreviewNextCycleCorrect({ preview, expectDefined: false });

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		entity_id: entities[1].id,
		billing_cycle_anchor: "now",
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entity1, productId: pro.id });
	expectBalanceCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	const entity2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({ customer: entity2, productId: pro.id });
	await expectProductNotPresent({ customer: entity2, productId: free.id });
	expectBalanceCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 20,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
