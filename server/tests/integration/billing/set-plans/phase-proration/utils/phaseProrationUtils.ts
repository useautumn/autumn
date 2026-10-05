import { expect } from "bun:test";
import {
	CusProductStatus,
	ms,
	type PhaseProrationBehavior,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";

const LATER_PHASE_OFFSET_DAYS = 10;

export const setupPhaseProrationScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.base({
		id: `${customerId}-pro`,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});
	const premium = products.base({
		id: `${customerId}-premium`,
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyPrice({ price: 50 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	return {
		...scenario,
		pro,
		premium,
		laterPhaseStartsAt: scenario.advancedTo + ms.days(LATER_PHASE_OFFSET_DAYS),
	};
};

/** Pro now, premium from the later phase: an upgrade mid-cycle. */
export const proThenPremiumParams = ({
	customerId,
	laterPhaseStartsAt,
	proPlanId,
	premiumPlanId,
	billingCycleAnchor,
	prorationBehavior,
}: {
	customerId: string;
	laterPhaseStartsAt: number;
	proPlanId: string;
	premiumPlanId: string;
	billingCycleAnchor?: "phase_start";
	prorationBehavior?: PhaseProrationBehavior;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{ starts_at: "now", plans: [{ plan_id: proPlanId }] },
		{
			starts_at: laterPhaseStartsAt,
			plans: [{ plan_id: premiumPlanId }],
			...(billingCycleAnchor && { billing_cycle_anchor: billingCycleAnchor }),
			...(prorationBehavior && { proration_behavior: prorationBehavior }),
		},
	],
});

export const stripeSchedulePhaseStartingAt = async ({
	ctx,
	customerId,
	startsAt,
}: {
	ctx: TestContext;
	customerId: string;
	startsAt: number;
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
	if (!scheduleId) throw new Error(`${customerId} has no Stripe schedule`);

	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	const phase = schedule.phases.find(
		(candidate) =>
			Math.abs(candidate.start_date * 1000 - startsAt) < ms.minutes(1),
	);
	if (!phase) throw new Error(`No Stripe phase starts at ${startsAt}`);
	return phase;
};

/** What reopening the Set Plans sheet reads: the scheduled row's saved proration. */
export const expectScheduledPhaseProrationSaved = async ({
	ctx,
	customerId,
	productId,
	prorationBehavior,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	prorationBehavior: PhaseProrationBehavior | null;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const scheduled = fullCustomer.customer_products.find(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Scheduled &&
			customerProduct.product.id === productId,
	);
	expect(scheduled).toBeDefined();
	expect(scheduled?.phase_proration_behavior ?? null).toBe(prorationBehavior);
};

const isProrationLine = (line: Stripe.InvoiceLineItem) =>
	line.parent?.subscription_item_details?.proration === true;

/** Advances past the later phase's start and returns the proration lines Stripe invoiced for it. */
export const advancePastPhaseStartAndGetProrationLines = async ({
	ctx,
	customerId,
	testClockId,
	laterPhaseStartsAt,
}: {
	ctx: TestContext;
	customerId: string;
	testClockId: string;
	laterPhaseStartsAt: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: laterPhaseStartsAt + ms.hours(2),
		waitForSeconds: 30,
	});

	const invoices = await ctx.stripeCli.invoices.list({
		subscription: subscription.id,
		created: { gte: Math.floor(laterPhaseStartsAt / 1000) - 60 },
	});
	return invoices.data.flatMap((invoice) =>
		invoice.lines.data.filter(isProrationLine),
	);
};
