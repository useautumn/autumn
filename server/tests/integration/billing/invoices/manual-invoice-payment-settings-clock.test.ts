import { expect, test } from "bun:test";
import { BillingVersion, type BillingContext } from "@autumn/shared";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";
import chalk from "chalk";
import type Stripe from "stripe";

const createDraftManualInvoice = async ({
	ctx,
	stripeCustomerId,
	stripeSubscription,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	stripeCustomerId: string;
	stripeSubscription: Stripe.Subscription;
}) => {
	const result = await createInvoiceForBilling({
		ctx,
		billingContext: {
			currentEpochMs: Date.now(),
			billingCycleAnchorMs: "now",
			resetCycleAnchorMs: "now",
			billingVersion: BillingVersion.V2,
			fullCustomer: {},
			fullProducts: [],
			featureQuantities: [],
			invoiceMode: {
				finalizeInvoice: false,
				enableProductImmediately: true,
			},
			stripeCustomer: { id: stripeCustomerId },
			stripeSubscription,
		} as unknown as BillingContext,
		stripeInvoiceAction: {
			addLineParams: {
				lines: [{ amount: 1000, description: "Manual test-clock charge" }],
			},
		},
	});

	return ctx.stripeCli.invoices.retrieve(result.invoice.id!);
};

test.concurrent(
	`${chalk.yellowBright("manual invoices use current payment settings after test clock advances")}`,
	async () => {
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [priceItem],
		});

		const { ctx, customer, testClockId, advancedTo } = await initScenario({
			customerId: "manual-invoice-settings-clock",
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const stripeCustomerId = customer.processor.id;
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 1,
		});
		const subscription = subscriptions.data[0];
		expect(subscription).toBeDefined();

		const subscriptionWithBankTransfer =
			await ctx.stripeCli.subscriptions.update(subscription.id, {
				collection_method: "send_invoice",
				days_until_due: 30,
				payment_settings: {
					payment_method_types: ["card", "customer_balance"],
				},
			});

		const firstInvoice = await createDraftManualInvoice({
			ctx,
			stripeCustomerId,
			stripeSubscription: subscriptionWithBankTransfer,
		});
		expect(firstInvoice.payment_settings?.payment_method_types).toContain(
			"customer_balance",
		);

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(advancedTo),
			numberOfDays: 15,
			waitForSeconds: 5,
		});

		const subscriptionWithoutBankTransfer =
			await ctx.stripeCli.subscriptions.update(subscription.id, {
				collection_method: "send_invoice",
				days_until_due: 30,
				payment_settings: {
					payment_method_types: ["card"],
				},
			});

		const futureInvoice = await createDraftManualInvoice({
			ctx,
			stripeCustomerId,
			stripeSubscription: subscriptionWithoutBankTransfer,
		});

		expect(futureInvoice.payment_settings?.payment_method_types).toEqual([
			"card",
		]);
		expect(futureInvoice.payment_settings?.payment_method_types).not.toContain(
			"customer_balance",
		);
	},
);
