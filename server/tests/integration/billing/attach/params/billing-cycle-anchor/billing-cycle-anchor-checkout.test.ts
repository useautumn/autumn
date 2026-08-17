import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	completeInvoiceCheckoutV2,
	completeStripeCheckoutFormV2,
} from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

test(`${chalk.yellowBright("attach scheduled anchor checkout: schedule attaches after subscription creation")}`, async () => {
	const customerId = "attach-anchor-checkout";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [pro] })],
		actions: [],
	});
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	expect(result.payment_url).toContain("checkout.stripe.com");
	await completeStripeCheckoutFormV2({ url: result.payment_url! });
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("attach scheduled anchor invoice mode: deferred plan retains the reset target")}`, async () => {
	const customerId = "attach-anchor-deferred-invoice";
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
		actions: [],
	});
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();

	const result = await autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
		invoice_mode: {
			enabled: true,
			finalize: true,
			enable_plan_immediately: false,
		},
	});

	expect(result.invoice?.status).toBe("open");
	expect(result.invoice?.hosted_invoice_url).toBeDefined();
	await completeInvoiceCheckoutV2({
		url: result.invoice!.hosted_invoice_url!,
		ctx,
		customerId,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		planId: pro.id,
		nextResetAt: scheduledAnchorMs,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
