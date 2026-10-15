/** Several Autumn customers can be billed through one Stripe customer (one org paying for another).
 * A renewal must reach the customer whose plan is on the renewing subscription, and when two
 * customers' plans sit on the same subscription, both are billed for usage and both reset. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	customerProducts,
	invoiceLineItems,
	invoices,
} from "@autumn/shared";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

const INCLUDED_MESSAGES = 100;
const TRACKED_MESSAGES = 150;
const OVERAGE_AMOUNT = (TRACKED_MESSAGES - INCLUDED_MESSAGES) * 0.1;

const getMessagesUsage = async ({
	autumnV1,
	customerId,
}: {
	autumnV1: AutumnInt;
	customerId: string;
}) => {
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	return customer.features[TestFeature.Messages]?.usage;
};

const getCycleMessagesAmounts = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}) => {
	const { data: stripeInvoices } = await stripeCli.invoices.list({
		customer: stripeCustomerId,
		limit: 100,
	});
	return stripeInvoices
		.filter((invoice) => invoice.billing_reason === "subscription_cycle")
		.map((invoice) => ({
			invoiceId: invoice.id,
			subscriptionId: invoice.parent?.subscription_details?.subscription,
			messagesAmounts: invoice.lines.data
				.filter((line) => /messages/i.test(line.description ?? ""))
				.map((line) => line.amount / 100)
				.filter((amount) => amount !== 0),
		}));
};

/** Creates a second customer and links it to the primary customer's Stripe customer. */
const createLinkedCustomer = async ({
	autumnV1,
	customerId,
	stripeCustomerId,
}: {
	autumnV1: AutumnInt;
	customerId: string;
	stripeCustomerId: string;
}) => {
	try {
		await autumnV1.customers.delete(customerId);
	} catch {}
	await autumnV1.customers.create({
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
	});
	await autumnV1.customers.update(customerId, { stripe_id: stripeCustomerId });
};

/** Moves a customer's plan onto another customer's subscription, the way legacy billing put a
 * second org's plan on another org's subscription, and cancels the plan's own subscription. */
const moveLinkedPlanOntoSubscription = async ({
	ctx,
	customerId,
	productId,
	subscriptionId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	subscriptionId: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = customer.customer_products.find(
		(customerProduct) => customerProduct.product.id === productId,
	)!;
	const ownSubscriptionId = customerProduct.subscription_ids![0];
	await ctx.db
		.update(customerProducts)
		.set({ subscription_ids: [subscriptionId] })
		.where(eq(customerProducts.id, customerProduct.id));
	await ctx.stripeCli.subscriptions.cancel(ownSubscriptionId, {
		prorate: false,
		invoice_now: false,
	});
	await deleteCachedFullCustomer({ ctx, customerId });
	await timeout(3000);
	return customerProduct;
};

/** Line items are stored by an async workflow; waits for the invoice's usage lines to land. */
const waitForUsageLineCustomerProductIds = async ({
	ctx,
	stripeInvoiceId,
	expectedCount,
}: {
	ctx: TestContext;
	stripeInvoiceId: string;
	expectedCount: number;
}) => {
	let customerProductIds: string[] = [];
	for (let attempt = 0; attempt < 15; attempt++) {
		const usageLines = await ctx.db
			.select({ customerProductIds: invoiceLineItems.customer_product_ids })
			.from(invoiceLineItems)
			.where(
				and(
					eq(invoiceLineItems.stripe_invoice_id, stripeInvoiceId),
					eq(invoiceLineItems.feature_id, TestFeature.Messages),
				),
			);
		customerProductIds = usageLines.flatMap((line) => line.customerProductIds);
		if (customerProductIds.length >= expectedCount) break;
		await timeout(2000);
	}
	return customerProductIds;
};

test.concurrent(
	`${chalk.yellowBright("shared-stripe-customer1: two customers with their own subscriptions on one Stripe customer both renew")}`,
	async () => {
		const pro = products.pro({
			items: [items.consumableMessages({ includedUsage: INCLUDED_MESSAGES })],
		});
		const payerId = "shared-stripe-cus-1-payer";
		const linkedId = "shared-stripe-cus-1-linked";

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId: payerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const stripeCli = ctx.stripeCli;
		const stripeCustomerId = (
			await CusService.getFull({ ctx, idOrInternalId: payerId })
		).processor!.id;

		await createLinkedCustomer({
			autumnV1,
			customerId: linkedId,
			stripeCustomerId,
		});
		await autumnV1.attach({ customer_id: linkedId, product_id: pro.id });

		const subscriptions = await stripeCli.subscriptions.list({
			customer: stripeCustomerId,
		});
		expect(subscriptions.data).toHaveLength(2);

		for (const customerId of [payerId, linkedId]) {
			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED_MESSAGES,
			});
		}
		await timeout(3000);

		await advanceToNextInvoice({
			stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		for (const customerId of [payerId, linkedId]) {
			expect(await getMessagesUsage({ autumnV1, customerId })).toBe(0);
		}

		const cycleInvoices = await getCycleMessagesAmounts({
			stripeCli,
			stripeCustomerId,
		});
		expect(cycleInvoices).toHaveLength(2);
		for (const cycleInvoice of cycleInvoices) {
			expect(cycleInvoice.messagesAmounts).toEqual([OVERAGE_AMOUNT]);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("shared-stripe-customer2: two customers on the same subscription are both billed for usage and both reset")}`,
	async () => {
		const pro = products.pro({
			items: [items.consumableMessages({ includedUsage: INCLUDED_MESSAGES })],
		});
		const payerId = "shared-stripe-cus-2-payer";
		const linkedId = "shared-stripe-cus-2-linked";

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId: payerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const stripeCli = ctx.stripeCli;
		const payer = await CusService.getFull({ ctx, idOrInternalId: payerId });
		const stripeCustomerId = payer.processor!.id;
		const sharedSubscriptionId = payer.customer_products.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		)!.subscription_ids![0];

		await createLinkedCustomer({
			autumnV1,
			customerId: linkedId,
			stripeCustomerId,
		});
		await autumnV1.attach({ customer_id: linkedId, product_id: pro.id });
		const linkedCustomerProduct = await moveLinkedPlanOntoSubscription({
			ctx,
			customerId: linkedId,
			productId: pro.id,
			subscriptionId: sharedSubscriptionId,
		});

		for (const customerId of [payerId, linkedId]) {
			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: TRACKED_MESSAGES,
			});
		}
		await timeout(3000);

		await advanceToNextInvoice({
			stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		for (const customerId of [payerId, linkedId]) {
			expect(await getMessagesUsage({ autumnV1, customerId })).toBe(0);
		}

		const cycleInvoices = await getCycleMessagesAmounts({
			stripeCli,
			stripeCustomerId,
		});
		expect(cycleInvoices).toHaveLength(1);
		expect(cycleInvoices[0].subscriptionId).toBe(sharedSubscriptionId);
		expect(cycleInvoices[0].messagesAmounts).toEqual([
			OVERAGE_AMOUNT,
			OVERAGE_AMOUNT,
		]);

		// The renewal invoice is recorded once, under the payer.
		const [autumnInvoice] = await ctx.db
			.select({ internalCustomerId: invoices.internal_customer_id })
			.from(invoices)
			.where(eq(invoices.stripe_id, cycleInvoices[0].invoiceId));
		expect(autumnInvoice?.internalCustomerId).toBe(payer.internal_id);

		// Both customers' usage lines are stored with their own plan's links
		const payerCustomerProductId = payer.customer_products.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		)!.id;
		const usageLineCustomerProductIds =
			await waitForUsageLineCustomerProductIds({
				ctx,
				stripeInvoiceId: cycleInvoices[0].invoiceId,
				expectedCount: 2,
			});
		expect(usageLineCustomerProductIds.sort()).toEqual(
			[payerCustomerProductId, linkedCustomerProduct.id].sort(),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("shared-stripe-customer3: an unlinked customer's older plan on the payer's subscription doesn't take the payer's webhooks")}`,
	async () => {
		const pro = products.pro({
			items: [items.consumableMessages({ includedUsage: INCLUDED_MESSAGES })],
		});
		const payerId = "shared-stripe-cus-3-payer";
		const linkedId = "shared-stripe-cus-3-linked";

		const { autumnV1, ctx } = await initScenario({
			customerId: payerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const payer = await CusService.getFull({ ctx, idOrInternalId: payerId });
		const payerCustomerProduct = payer.customer_products.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		)!;
		const sharedSubscriptionId = payerCustomerProduct.subscription_ids![0];

		await createLinkedCustomer({
			autumnV1,
			customerId: linkedId,
			stripeCustomerId: payer.processor!.id,
		});
		await autumnV1.attach({ customer_id: linkedId, product_id: pro.id });
		const linkedCustomerProduct = await moveLinkedPlanOntoSubscription({
			ctx,
			customerId: linkedId,
			productId: pro.id,
			subscriptionId: sharedSubscriptionId,
		});

		// The second org isn't linked to the Stripe customer, and its plan is the older one on the subscription
		await autumnV1.customers.update(linkedId, { stripe_id: null });
		await ctx.db
			.update(customerProducts)
			.set({ created_at: payerCustomerProduct.created_at - 60_000 })
			.where(eq(customerProducts.id, linkedCustomerProduct.id));

		await ctx.stripeCli.subscriptions.cancel(sharedSubscriptionId);
		await timeout(8000);

		const payerAfter = await autumnV1.customers.get<ApiCustomerV3>(payerId);
		await expectProductNotPresent({ customer: payerAfter, productId: pro.id });
	},
);
