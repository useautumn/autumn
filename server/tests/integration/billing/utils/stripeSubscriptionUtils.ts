import { applyProration } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

/**
 * Get Stripe subscription for a customer.
 */
export const getStripeSubscription = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	if (!stripeCustomerId) {
		throw new Error("Missing Stripe customer ID");
	}

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});

	if (subscriptions.data.length === 0) {
		throw new Error("No subscriptions found");
	}

	// Find an active subscription (not canceled)
	const subscription =
		subscriptions.data.find(
			(sub) => sub.status === "active" || sub.status === "trialing",
		) ?? subscriptions.data[0];

	// Get billing period from the first subscription item
	// Stripe stores current_period_start/end on each item, not the subscription itself
	const firstItem = subscription.items.data[0];
	if (!firstItem) {
		throw new Error("No subscription items found");
	}

	const itemData = firstItem as unknown as {
		current_period_start: number;
		current_period_end: number;
	};

	const periodStart = itemData.current_period_start;
	const periodEnd = itemData.current_period_end;

	if (typeof periodStart !== "number" || typeof periodEnd !== "number") {
		console.log("Subscription data:", JSON.stringify(subscription, null, 2));
		throw new Error(
			`Invalid billing period: start=${periodStart}, end=${periodEnd}`,
		);
	}

	return {
		stripeCli,
		stripeCustomerId,
		subscription,
		billingPeriod: {
			start: periodStart * 1000,
			end: periodEnd * 1000,
		},
	};
};

/**
 * Calculate prorated refund for the remaining billing period.
 */
export const calculateProratedRefund = async ({
	customerId,
	nowMs,
	amount,
}: {
	customerId: string;
	nowMs: number;
	amount: number;
}): Promise<number> => {
	const { billingPeriod } = await getStripeSubscription({ customerId });

	const prorated = applyProration({
		now: nowMs,
		billingPeriod,
		amount,
	});

	return -Number(prorated.toFixed(2));
};

/**
 * Calculate prorated charge for the remaining billing period.
 */
export const calculateProratedCharge = async ({
	customerId,
	nowMs,
	amount,
}: {
	customerId: string;
	nowMs: number;
	amount: number;
}): Promise<number> => {
	const { billingPeriod } = await getStripeSubscription({ customerId });

	return Number(
		applyProration({
			now: nowMs,
			billingPeriod,
			amount,
		}).toFixed(2),
	);
};
