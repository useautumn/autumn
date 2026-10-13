import { expect } from "bun:test";
import {
	findActiveCustomerProductById,
	msToSeconds,
	secondsToMs,
	stripeRefToId,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { timeout } from "@/utils/genUtils";
import { findStripeSubscriptionByStatus } from "./subscriptionStateUtils";

const WEBHOOK_SETTLE_MS = 12_000;

/** Cancels the customer's live subscription in Stripe, returning the dates a resync rebuilds it on. */
export const cancelSubscriptionForResync = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const oldSubscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const oldPeriodEnd = oldSubscription.items.data[0]?.current_period_end;
	if (!oldPeriodEnd) throw new Error("Old subscription has no period end");

	await ctx.stripeCli.subscriptions.cancel(oldSubscription.id);
	await timeout(WEBHOOK_SETTLE_MS);

	return {
		oldSubscriptionId: oldSubscription.id,
		oldStartMs: secondsToMs(oldSubscription.start_date),
		oldPeriodEndMs: secondsToMs(oldPeriodEnd),
	};
};

/** Cancels in Stripe while Autumn's rows are unlinked, as if the webhook never arrived. */
export const cancelSubscriptionMissingWebhook = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const { customer_products: customerProducts } = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	for (const customerProduct of customerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { subscription_ids: [] },
		});
	}
	const cancelled = await cancelSubscriptionForResync({ ctx, customerId });
	for (const customerProduct of customerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { subscription_ids: customerProduct.subscription_ids },
		});
	}
	return cancelled;
};

/** The rebuilt subscription anchors on the old period end, starts on startMs when given, and charged nothing. */
export const expectResyncedSubscriptionCorrect = async ({
	ctx,
	customerId,
	oldSubscriptionId,
	startMs,
	anchorMs,
}: {
	ctx: TestContext;
	customerId: string;
	oldSubscriptionId: string;
	startMs?: number;
	anchorMs: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	expect(subscription.id).not.toBe(oldSubscriptionId);
	if (startMs !== undefined) {
		expect(subscription.start_date).toBe(msToSeconds(startMs));
	}
	expect(subscription.billing_cycle_anchor).toBe(msToSeconds(anchorMs));

	const { data: invoices } = await ctx.stripeCli.invoices.list({
		subscription: subscription.id,
	});
	const amountDue = invoices.reduce(
		(total, invoice) => total + invoice.amount_due,
		0,
	);
	expect(amountDue).toBe(0);
	return subscription;
};

/** The same customer product row is still active, linked to exactly the given subscription. */
export const expectPlanKept = async ({
	ctx,
	customerId,
	productId,
	customerProductId,
	subscriptionId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	customerProductId: string;
	subscriptionId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});
	expect(customerProduct?.id).toBe(customerProductId);
	expect(customerProduct?.subscription_ids).toEqual([subscriptionId]);
};

export const expectPlanStartsAt = async ({
	ctx,
	customerId,
	productId,
	startsAt,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	startsAt: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});
	expect(customerProduct?.starts_at).toBe(startsAt);
};

/** The live subscription's schedule restarts the cycle with a phase that starts on the anchor. */
export const expectCycleResetPhase = async ({
	ctx,
	customerId,
	anchorMs,
}: {
	ctx: TestContext;
	customerId: string;
	anchorMs: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const scheduleId = stripeRefToId(subscription.schedule);
	if (!scheduleId) throw new Error("Live subscription has no schedule");

	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	const resetPhase = schedule.phases.find(
		(phase) => phase.start_date === msToSeconds(anchorMs),
	);
	expect(resetPhase?.billing_cycle_anchor).toBe("phase_start");
};

export const expectPlansEndAt = async ({
	ctx,
	customerId,
	productIds,
	endsAt,
}: {
	ctx: TestContext;
	customerId: string;
	productIds: string[];
	endsAt: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const endedAtByProductId = Object.fromEntries(
		productIds.map((productId) => [
			productId,
			findActiveCustomerProductById({ fullCus: fullCustomer, productId })
				?.ended_at,
		]),
	);
	expect(endedAtByProductId).toEqual(
		Object.fromEntries(productIds.map((productId) => [productId, endsAt])),
	);
};

/** The live subscription stops billing on endsAt, through cancel_at or a schedule that cancels. */
export const expectLiveSubscriptionEndsAt = async ({
	ctx,
	customerId,
	endsAt,
}: {
	ctx: TestContext;
	customerId: string;
	endsAt: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const scheduleId = stripeRefToId(subscription.schedule);
	const schedule = scheduleId
		? await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId)
		: undefined;
	const scheduleEndsAt =
		schedule?.end_behavior === "cancel"
			? schedule.phases.at(-1)?.end_date
			: undefined;

	expect(subscription.cancel_at ?? scheduleEndsAt).toBe(msToSeconds(endsAt));
};
