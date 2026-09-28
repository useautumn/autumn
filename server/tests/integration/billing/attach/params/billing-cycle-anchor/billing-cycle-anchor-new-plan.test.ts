import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	secondsToMs,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateNewSubscriptionAnchorStub } from "@tests/integration/billing/utils/proration";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

test(`${chalk.yellowBright("billing-cycle-anchor-new-plan 1: free -> pro, scheduled anchor before next cycle end")}`, async () => {
	const customerId = "anchor-new-plan-free-pro-scheduled";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_3, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const preview = await autumnV2_3.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	// A new subscription is created on the anchor, so only the days until it are charged.
	expect(preview.total).toBe(
		calculateNewSubscriptionAnchorStub({
			advancedTo,
			anchorMs: scheduledAnchorMs,
			amount: 20,
		}),
	);

	await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const customerAfterAttach =
		await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectBalanceCorrect({
		customer: customerAfterAttach,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: preview.total,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const customerAfterReset =
		await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

	await expectCustomerProducts({
		customer: customerAfterReset,
		active: [pro.id],
	});

	expectBalanceCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("billing-cycle-anchor-new-plan 2: no plan -> pro, scheduled anchor")}`, async () => {
	const customerId = "anchor-new-plan-none-pro-scheduled";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	// A new subscription is created on the anchor, so only the days until it are charged.
	expect(preview.total).toBe(
		calculateNewSubscriptionAnchorStub({
			advancedTo,
			anchorMs: scheduledAnchorMs,
			amount: 20,
		}),
	);

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
		redirect_mode: "if_required",
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });

	const customerAfterAttach =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	await expectCustomerProducts({
		customer: customerAfterAttach,
		active: [pro.id],
	});

	expectBalanceCorrect({
		customer: customerAfterAttach,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: preview.total,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const customerAfterReset =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	await expectCustomerProducts({
		customer: customerAfterReset,
		active: [pro.id],
	});

	expectBalanceCorrect({
		customer: customerAfterReset,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(
	`${chalk.yellowBright("billing-cycle-anchor-new-plan 3: free -> pro, anchor now")}`,
	async () => {
		const customerId = "anchor-new-plan-free-pro-now";

		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: pro.id,
				billing_cycle_anchor: "now",
			},
		);

		expect(preview.total).toBe(20);
		expectPreviewNextCycleCorrect({ preview, expectDefined: false });

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			billing_cycle_anchor: "now",
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});

		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 100,
			usage: 0,
			planId: pro.id,
			nextResetAt: addMonths(advancedTo, 1).getTime(),
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test(`${chalk.yellowBright("billing-cycle-anchor-new-plan 4: no plan -> pro, scheduled anchor, proration none bills nothing until the anchor")}`, async () => {
	const customerId = "anchor-new-plan-none-pro-scheduled";

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
		actions: [],
	});

	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();
	const attachParams: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
		proration_behavior: "none",
	};

	const preview =
		await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(attachParams);
	expect(preview.total).toBe(0);

	await autumnV2_3.billing.attach<AttachParamsV1Input>(attachParams);

	const { subscription } = await getStripeSubscription({ customerId });
	expect(secondsToMs(subscription.billing_cycle_anchor)).toBe(
		Math.floor(scheduledAnchorMs / 1000) * 1000,
	);

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 0 });

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});

	const customerAfterAnchor =
		await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: customerAfterAnchor,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: addMonths(scheduledAnchorMs, 1).getTime(),
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: 20,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
