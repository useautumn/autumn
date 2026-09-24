/**
 * Billing Verify: billing-cycle-anchor drift on the current phase
 *
 * Contract under test (billingActions.verify):
 *   - Anchor drift on the schedule's CURRENT phase is reported without a
 *     phase_starts_at stamp — it is the live phase, not a future one.
 *   - Anchor drift on a LATER phase carries that phase's start.
 *
 * Red (current): phase 0 is stamped with the current phase start, so the
 * message reads "(in future phase starting <months ago>)".
 * Green (after): phase 0 carries no stamp; later phases keep theirs.
 */

import { expect, test } from "bun:test";
import {
	type CreateScheduleParamsV0Input,
	ms,
	type ScheduleMismatch,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { listActiveStripeSubscriptions } from "../restore/utils/corruptStripeSubscription";

const scheduleIdFor = async ({
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
	if (!stripeCustomerId) throw new Error("Customer has no Stripe customer ID");
	const [subscription] = await listActiveStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	const scheduleId =
		typeof subscription.schedule === "string"
			? subscription.schedule
			: subscription.schedule?.id;
	if (!scheduleId) throw new Error("Expected a schedule on the subscription");
	return scheduleId;
};

/** Flips one phase's billing_cycle_anchor to phase_start, leaving the rest as is. */
const driftPhaseAnchor = async ({
	ctx,
	scheduleId,
	phaseIndex,
}: {
	ctx: TestContext;
	scheduleId: string;
	phaseIndex: number;
}) => {
	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	await ctx.stripeCli.subscriptionSchedules.update(scheduleId, {
		phases: schedule.phases.map((phase, index) => ({
			start_date: phase.start_date,
			end_date: phase.end_date,
			proration_behavior: "none",
			...(index === phaseIndex && { billing_cycle_anchor: "phase_start" }),
			items: phase.items.map((item) => ({
				price: typeof item.price === "string" ? item.price : item.price.id,
				...(item.quantity !== undefined && { quantity: item.quantity }),
			})),
		})),
	});
	return schedule;
};

const setupTwoPhaseSchedule = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const next = products.premium({
		id: "next",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, next] }),
		],
		actions: [],
	});
	const now = Date.now();
	const params: CreateScheduleParamsV0Input = {
		customer_id: customerId,
		phases: [
			{ starts_at: now, plans: [{ plan_id: pro.id }] },
			{ starts_at: now + ms.days(30), plans: [{ plan_id: next.id }] },
		],
	};
	expect((await autumnV1.billing.createSchedule(params)).status).toBe(
		"created",
	);
	return { ctx, scheduleId: await scheduleIdFor({ ctx, customerId }) };
};

const anchorMismatches = (result: Awaited<ReturnType<typeof verify>>) =>
	result.subscriptions[0].mismatches.filter(
		(mismatch): mismatch is ScheduleMismatch =>
			mismatch.type === "schedule_mismatch" &&
			mismatch.reason === "billing_cycle_anchor_mismatch",
	);

test.concurrent(
	`${chalk.yellowBright("billing-verify current-phase-anchor 1: anchor drift on the current phase -> no future-phase stamp")}`,
	async () => {
		const customerId = "verify-anchor-current-phase";
		const { ctx, scheduleId } = await setupTwoPhaseSchedule({ customerId });

		await driftPhaseAnchor({ ctx, scheduleId, phaseIndex: 0 });

		const result = await verify({ ctx, params: { customer_id: customerId } });
		const [mismatch] = anchorMismatches(result);

		expect(mismatch).toBeDefined();
		expect(mismatch.phase_starts_at).toBeUndefined();
		expect(mismatch.message).not.toContain("future phase");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify current-phase-anchor 2: anchor drift on a later phase -> stamped with that phase's start")}`,
	async () => {
		const customerId = "verify-anchor-later-phase";
		const { ctx, scheduleId } = await setupTwoPhaseSchedule({ customerId });

		const schedule: Stripe.SubscriptionSchedule = await driftPhaseAnchor({
			ctx,
			scheduleId,
			phaseIndex: 1,
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });
		const [mismatch] = anchorMismatches(result);

		expect(mismatch).toBeDefined();
		expect(mismatch.phase_starts_at).toBe(schedule.phases[1].start_date);
		expect(mismatch.message).toContain("future phase");
	},
);
