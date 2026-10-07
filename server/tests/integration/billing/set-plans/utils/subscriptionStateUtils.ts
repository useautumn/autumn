import { expect } from "bun:test";
import {
	CusProductStatus,
	findActiveCustomerProductById,
	ms,
	type SetPlansPreviewResponse,
	type SetPlansPreviewWarning,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const getStripeCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`${customerId} has no Stripe customer`);
	return { fullCustomer, stripeCustomerId };
};

export const findStripeSubscriptionByStatus = async ({
	ctx,
	customerId,
	status,
}: {
	ctx: TestContext;
	customerId: string;
	status: Stripe.Subscription.Status;
}) => {
	const { stripeCustomerId } = await getStripeCustomerId({ ctx, customerId });
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status,
	});
	const subscription = data[0];
	if (!subscription) throw new Error(`No ${status} subscription`);
	return subscription;
};

/** The old subscription is cancelled and the plan lives on exactly one new subscription. */
export const expectSubscriptionReplaced = async ({
	ctx,
	customerId,
	productId,
	replacedSubscriptionId,
	replacedStatus = "canceled",
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	replacedSubscriptionId: string;
	replacedStatus?: Stripe.Subscription.Status;
}) => {
	const replaced = await ctx.stripeCli.subscriptions.retrieve(
		replacedSubscriptionId,
	);
	expect(replaced.status).toBe(replacedStatus);

	const { fullCustomer, stripeCustomerId } = await getStripeCustomerId({
		ctx,
		customerId,
	});
	const { data: liveSubscriptions } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(liveSubscriptions).toHaveLength(1);
	const [newSubscription] = liveSubscriptions;
	expect(newSubscription?.id).not.toBe(replacedSubscriptionId);

	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});
	expect(customerProduct?.subscription_ids).toEqual([newSubscription!.id]);

	const pendingRows = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		inStatuses: [CusProductStatus.Pending],
	});
	expect(pendingRows).toHaveLength(0);
};

/** The customer's live subscription has collected exactly `total` (major units) so far. */
export const expectLiveSubscriptionCharged = async ({
	ctx,
	customerId,
	total,
}: {
	ctx: TestContext;
	customerId: string;
	total: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const { data: invoices } = await ctx.stripeCli.invoices.list({
		subscription: subscription.id,
	});
	const amountPaid = invoices.reduce(
		(sum, invoice) => sum + invoice.amount_paid,
		0,
	);
	expect(amountPaid / 100).toBe(total);
};

/** The preview names the warning, and its message mentions each given fragment. */
export const expectPreviewWarning = ({
	preview,
	type,
	messageContains = [],
}: {
	preview: SetPlansPreviewResponse;
	type: SetPlansPreviewWarning["type"];
	messageContains?: string[];
}) => {
	const warning = preview.warnings.find((candidate) => candidate.type === type);
	expect(
		warning,
		`preview warnings ${JSON.stringify(preview.warnings.map((w) => w.type))} miss ${type}`,
	).toBeDefined();
	for (const fragment of messageContains) {
		expect(warning?.message).toContain(fragment);
	}
};

/** A card-not-required trial that Stripe pauses at trial end, since no card was added. */
export const setupPausedPro = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const trialDays = 3;
	const pro = products.baseWithTrial({
		id: "pro",
		items: [items.monthlyPrice({ price: 20 })],
		trialDays,
		cardRequired: false,
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		// v1 attach still runs no-card trials on Stripe; billing.attach keeps them Autumn-only (#4024).
		actions: [s.attach({ productId: pro.id })],
	});
	const { ctx, testClockId, advancedTo } = scenario;

	const trialing = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "trialing",
	});
	await ctx.stripeCli.subscriptions.update(trialing.id, {
		trial_settings: { end_behavior: { missing_payment_method: "pause" } },
	});
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: advancedTo + ms.days(trialDays + 1),
		waitForSeconds: 30,
	});
	const paused = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
	expect(paused.status).toBe("paused");

	return { ...scenario, pro, paused };
};

/** The invoices a Stripe subscription raised, oldest first, as totals in major units. */
export const expectSubscriptionInvoiceTotals = async ({
	ctx,
	subscriptionId,
	totals,
}: {
	ctx: TestContext;
	subscriptionId: string;
	totals: number[];
}) => {
	const { data: invoices } = await ctx.stripeCli.invoices.list({
		subscription: subscriptionId,
	});
	expect(
		[...invoices].reverse().map((invoice) =>
			stripeToAtmnAmount({
				amount: invoice.total,
				currency: invoice.currency,
			}),
		),
	).toEqual(totals);
};
