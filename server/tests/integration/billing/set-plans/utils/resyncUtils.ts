import { expect } from "bun:test";
import {
	findActiveCustomerProductById,
	msToSeconds,
	secondsToMs,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { CusService } from "@/internal/customers/CusService";
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

/** The rebuilt subscription starts on the old start, anchors on the old period end and charged nothing. */
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
	startMs: number;
	anchorMs: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	expect(subscription.id).not.toBe(oldSubscriptionId);
	expect(subscription.start_date).toBe(msToSeconds(startMs));
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
	const scheduleId =
		typeof subscription.schedule === "string"
			? subscription.schedule
			: subscription.schedule?.id;
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
