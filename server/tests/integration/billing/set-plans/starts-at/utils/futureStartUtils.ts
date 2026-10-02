import { expect } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	msToSeconds,
} from "@autumn/shared";
import { triggerSubscriptionCreated } from "@tests/integration/billing/attach/params/start-date/utils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { addHours, addMinutes } from "date-fns";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";

/** The customer's row for a plan in a scope, skipping the expired rows a set_plans call leaves behind. */
export const findLiveCustomerProduct = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	entityId?: string;
}): Promise<FullCusProduct> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(candidate) =>
			candidate.product_id === productId &&
			candidate.status !== CusProductStatus.Expired &&
			(entityId === undefined || candidate.entity_id === entityId),
	);
	if (!customerProduct) {
		throw new Error(`No live ${productId} row for ${customerId}`);
	}
	return customerProduct;
};

/** The row rides a Stripe schedule whose first phase starts on the future start, to the second. */
export const expectFutureStartScheduleCorrect = async ({
	ctx,
	customerProduct,
	startsAt,
	createsSubscriptionLater = true,
}: {
	ctx: TestContext;
	customerProduct: FullCusProduct;
	startsAt: number;
	createsSubscriptionLater?: boolean;
}): Promise<Stripe.SubscriptionSchedule> => {
	expect(customerProduct.starts_at).toBe(startsAt);
	expect(customerProduct.scheduled_ids).toHaveLength(1);

	const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
		customerProduct.scheduled_ids![0]!,
	);
	const startPhase = schedule.phases.find(
		(phase) => phase.start_date === msToSeconds(startsAt),
	);
	expect(startPhase).toBeDefined();
	if (createsSubscriptionLater) {
		expect(schedule.status).toBe("not_started");
		expect(schedule.subscription).toBeNull();
	}
	return schedule;
};

const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	typeof schedule.subscription === "string"
		? schedule.subscription
		: schedule.subscription?.id;

/** Moves the test clock past the start, then delivers the subscription Stripe created to the subscription.created handler. */
export const activateFutureStart = async ({
	ctx,
	customerId,
	testClockId,
	scheduleId,
	startsAt,
}: {
	ctx: TestContext;
	customerId: string;
	testClockId: string;
	scheduleId: string;
	startsAt: number;
}): Promise<string> => {
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: addHours(startsAt, 1).getTime(),
		waitForSeconds: 30,
	});

	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	const stripeSubscriptionId = scheduleSubscriptionId(schedule);
	if (!stripeSubscriptionId) {
		throw new Error(`Schedule ${scheduleId} has not started a subscription`);
	}

	await triggerSubscriptionCreated({
		ctx,
		stripeSubId: stripeSubscriptionId,
		scheduleId,
		subscriptionCreatedAtMs: addMinutes(startsAt, 5).getTime(),
		fullCustomer: await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		}),
	});
	return stripeSubscriptionId;
};
