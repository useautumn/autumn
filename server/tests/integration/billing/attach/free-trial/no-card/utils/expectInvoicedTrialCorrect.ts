import { expect } from "bun:test";
import {
	atmnToStripeAmount,
	type CollectionMethod,
	CusProductStatus,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";

const stripeCustomerIdFor = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripeCustomerId = customer?.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`Customer ${customerId} has no processor`);
	return stripeCustomerId;
};

/** Every live customer product of `productId` (one per entity) stores `collectionMethod`. */
export const expectTrialCollectionMethod = async ({
	ctx,
	customerId,
	productId,
	collectionMethod,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	collectionMethod: CollectionMethod;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});
	const trialCustomerProducts = fullCustomer.customer_products.filter(
		(customerProduct) => customerProduct.product.id === productId,
	);

	expect(trialCustomerProducts.length).toBeGreaterThan(0);
	for (const customerProduct of trialCustomerProducts) {
		expect(customerProduct.collection_method).toBe(collectionMethod);
	}
};

/**
 * A converted invoice-mode trial: `subCount` send_invoice subs and, when `latestTotal`
 * is passed, the latest Stripe invoice is open for it with nothing charged.
 */
export const expectTrialInvoicedCorrect = async ({
	ctx,
	customerId,
	latestTotal,
	subCount = 1,
}: {
	ctx: TestContext;
	customerId: string;
	latestTotal?: number;
	subCount?: number;
}) => {
	const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });

	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subscriptions.data.length).toBe(subCount);
	for (const subscription of subscriptions.data) {
		expect(subscription.collection_method).toBe("send_invoice");
	}

	if (latestTotal === undefined) return;

	const [latestInvoice] = (
		await ctx.stripeCli.invoices.list({ customer: stripeCustomerId, limit: 1 })
	).data;
	expect(latestInvoice?.collection_method).toBe("send_invoice");
	expect(latestInvoice?.status).toBe("open");
	expect(latestInvoice?.amount_paid).toBe(0);
	expect(latestInvoice?.total).toBe(
		atmnToStripeAmount({ amount: latestTotal, currency: "usd" }),
	);
};
