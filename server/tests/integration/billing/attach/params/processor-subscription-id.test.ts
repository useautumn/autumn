import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { createCustomStripeSubscription } from "@tests/integration/billing/utils/stripe/createCustomStripeSubscription";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService";
import { expectCustomerInvoiceCorrect } from "../../utils/expectCustomerInvoiceCorrect";

test(`${chalk.yellowBright("processor_subscription_id: attach with existing stripe subscription anchors reset cycle")}`, async () => {
	const customerId = "processor-sub-id-anchor";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [monthlyMessages],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeSubscription = await createCustomStripeSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	const billingCycleAnchorMs = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	expect(testClockId).toBeDefined();
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 2,
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		processor_subscription_id: stripeSubscription.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
	});

	const fullCustomerAfter = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProduct = fullCustomerAfter.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);

	expect(cusProduct).toBeDefined();
	expect(cusProduct!.subscription_ids).toContain(stripeSubscription.id);

	const messagesResetAt =
		customerAfter.features[TestFeature.Messages]?.next_reset_at;
	expect(messagesResetAt).toBeDefined();

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		resetsAt: addMonths(billingCycleAnchorMs, 1).getTime(),
	});

	const stripeSubscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
		stripeSubscription.id,
	);
	expect(stripeSubscriptionAfter.status).toEqual("active");
	expectStripeSubscriptionUnchanged({
		before: stripeSubscription,
		after: stripeSubscriptionAfter,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
	});
});

test(`${chalk.yellowBright("processor_subscription_id: upgrade with no_billing_changes preserves anchor and subscription")}`, async () => {
	const customerId = "processor-sub-id-upgrade";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [monthlyMessages],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const stripeSubscription = await createCustomStripeSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	const billingCycleAnchorMs = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		processor_subscription_id: stripeSubscription.id,
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [pro.id],
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: premium.id,
		processor_subscription_id: stripeSubscription.id,
		no_billing_changes: true,
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		active: [premium.id],
		notPresent: [pro.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterUpgrade,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		resetsAt: addMonths(billingCycleAnchorMs, 1).getTime(),
	});

	const stripeSubscriptionAfterUpgrade =
		await ctx.stripeCli.subscriptions.retrieve(stripeSubscription.id);

	expect(stripeSubscriptionAfterUpgrade.status).toEqual("active");
	expectStripeSubscriptionUnchanged({
		before: stripeSubscription,
		after: stripeSubscriptionAfterUpgrade,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
	});
});
