import { expect } from "bun:test";
import {
	ms,
	type PhaseProrationBehavior,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { Decimal } from "decimal.js";
import { CusService } from "@/internal/customers/CusService";
import { getCustomerSchedulesByScope } from "@/internal/customers/cusUtils/getFullCustomerSchedule";

const LATER_PHASE_OFFSET_DAYS = 10;
const CENTS_PER_UNIT = 100;
const MS_PER_SECOND = 1000;

export const setupPhaseProrationScenario = async ({
	customerId,
	proAlreadyActive = false,
}: {
	customerId: string;
	proAlreadyActive?: boolean;
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
	const addOn = products.base({
		id: `${customerId}-addon`,
		isAddOn: true,
		items: [items.monthlyPrice({ price: 10 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, addOn] }),
		],
		actions: proAlreadyActive ? [s.billing.attach({ productId: pro.id })] : [],
	});

	return {
		...scenario,
		pro,
		premium,
		addOn,
		laterPhaseStartsAt: scenario.advancedTo + ms.days(LATER_PHASE_OFFSET_DAYS),
	};
};

/** Opening plans now, then the later phase's plans: an upgrade or a removal mid-cycle. */
export const twoPhaseParams = ({
	customerId,
	laterPhaseStartsAt,
	openingPlanIds,
	laterPlanIds,
	billingCycleAnchor,
	prorationBehavior,
}: {
	customerId: string;
	laterPhaseStartsAt: number;
	openingPlanIds: string[];
	laterPlanIds: string[];
	billingCycleAnchor?: "phase_start";
	prorationBehavior?: PhaseProrationBehavior;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{
			starts_at: "now",
			plans: openingPlanIds.map((planId) => ({ plan_id: planId })),
		},
		{
			starts_at: laterPhaseStartsAt,
			plans: laterPlanIds.map((planId) => ({ plan_id: planId })),
			...(billingCycleAnchor && { billing_cycle_anchor: billingCycleAnchor }),
			...(prorationBehavior && { proration_behavior: prorationBehavior }),
		},
	],
});

const sameSecond = (first: number, second: number) =>
	truncateMsToSecondPrecision(first) === truncateMsToSecondPrecision(second);

const activeSubscriptionScheduleId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
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
	return scheduleId;
};

export const stripeSchedulePhaseStartingAt = async ({
	ctx,
	customerId,
	startsAt,
}: {
	ctx: TestContext;
	customerId: string;
	startsAt: number;
}) => {
	const scheduleId = await activeSubscriptionScheduleId({ ctx, customerId });
	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	const phase = schedule.phases.find((candidate) =>
		sameSecond(candidate.start_date * 1000, startsAt),
	);
	if (!phase) throw new Error(`No Stripe phase starts at ${startsAt}`);
	return phase;
};

/** What reopening the Set Plans sheet reads: the saved schedule phase's proration. */
export const expectSavedPhaseProration = async ({
	ctx,
	customerId,
	startsAt,
	prorationBehavior,
}: {
	ctx: TestContext;
	customerId: string;
	startsAt: number;
	prorationBehavior: PhaseProrationBehavior | null;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const { customerSchedule, entitySchedules } =
		await getCustomerSchedulesByScope({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
		});
	const savedPhase = [customerSchedule, ...Object.values(entitySchedules)]
		.flatMap((schedule) => schedule?.phases ?? [])
		.find((phase) => sameSecond(phase.starts_at, startsAt));

	expect(savedPhase).toBeDefined();
	expect(savedPhase?.proration_behavior ?? null).toBe(prorationBehavior);
};

/** Advances past the later phase's start and returns the Stripe invoices raised at it, lines included. */
export const advancePastPhaseStartAndGetInvoices = async ({
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
	});

	// Stripe's server-side subscription/created filters miss the test-clock invoice raised at the phase start.
	const { data } = await ctx.stripeCli.invoices.list({
		customer: subscription.customer as string,
	});
	const phaseStartSeconds = Math.floor(laterPhaseStartsAt / 1000);
	return await Promise.all(
		data
			.filter((invoice) => invoice.created >= phaseStartSeconds - 60)
			.map((invoice) => ctx.stripeCli.invoices.retrieve(invoice.id!)),
	);
};

export const invoicesTotal = (invoices: { total: number }[]) =>
	invoices.reduce((total, invoice) => total + invoice.total, 0);

/** The previewed next_cycle is the invoice Stripe will actually raise next for the customer's schedule, to the cent. */
export const expectPreviewMatchesStripeUpcomingInvoice = async ({
	ctx,
	customerId,
	nextCycle,
}: {
	ctx: TestContext;
	customerId: string;
	nextCycle: SetPlansPreviewResponse["next_cycle"];
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
		customer: subscription.customer as string,
		schedule: await activeSubscriptionScheduleId({ ctx, customerId }),
	});
	const upcomingInvoiceStartsAt =
		Math.min(...upcomingInvoice.lines.data.map(({ period }) => period.start)) *
		MS_PER_SECOND;

	expect({
		startsAt: nextCycle && truncateMsToSecondPrecision(nextCycle.starts_at),
		total:
			nextCycle && new Decimal(nextCycle.total).toDecimalPlaces(2).toNumber(),
	}).toEqual({
		startsAt: upcomingInvoiceStartsAt,
		total: new Decimal(upcomingInvoice.total).div(CENTS_PER_UNIT).toNumber(),
	});
};
