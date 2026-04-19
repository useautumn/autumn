import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Reproduces: attaching a one-off add-on to a subscription that already
 * has a schedule (from a prior downgrade) fails with Stripe error
 * "You cannot migrate a subscription that is already attached to a schedule".
 *
 * The root cause is that setupStripeBillingContext skips fetching the schedule
 * when targetCustomerProduct is undefined (new attachment, no transition).
 * buildStripeSubscriptionScheduleAction then sees hasSchedule=false and emits
 * type:"create" instead of type:"update", which Stripe rejects.
 */
test.concurrent(`${chalk.yellowBright("bug-repro: attach one-off add-on after scheduled downgrade hits 'subscription already attached to schedule'")}`, async () => {
	const customerId = "repro-schedule-addon-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const topupAddon = products.base({
		id: "topup-addon",
		items: [
			items.oneOffWords({
				includedUsage: 0,
				billingUnits: 100,
				price: 25,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro, topupAddon] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Apply a 20% discount to the subscription (matches production scenario)
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Schedule downgrade: Premium -> Pro (creates a subscription schedule)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify the downgrade was scheduled correctly
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer, productId: premium.id });
	await expectProductScheduled({ customer, productId: pro.id });

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: topupAddon.id,
		redirect_mode: "if_required",
		options: [{ feature_id: TestFeature.Words, quantity: 100 }],
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Words,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 25,
	});
});
