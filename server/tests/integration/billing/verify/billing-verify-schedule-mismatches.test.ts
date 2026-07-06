/**
 * Billing Verify: Schedule Mismatches
 *
 * Contract under test (billingActions.verify):
 *   New behaviors:
 *     - Autumn expects a multi-phase Stripe subscription schedule but Stripe has
 *       none (released externally) -> mismatch { type: "schedule_mismatch",
 *       reason: "missing_schedule" }.
 *     - A scheduled future phase's item quantity drifted from Autumn's record ->
 *       mismatch on that phase carrying `phase_starts_at`.
 */

import { expect, test } from "bun:test";
import { type CreateScheduleParamsV0Input, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "../restore/utils/corruptStripeSubscription";

const stripeCustomerIdFor = async ({
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
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	return stripeCustomerId;
};

const buildTwoPhaseSchedule = ({
	customerId,
	proId,
	addonId,
}: {
	customerId: string;
	proId: string;
	addonId: string;
}) => {
	const now = Date.now();
	const params: CreateScheduleParamsV0Input = {
		customer_id: customerId,
		phases: [
			{ starts_at: now, plans: [{ plan_id: proId }, { plan_id: addonId }] },
			{ starts_at: now + ms.days(30), plans: [{ plan_id: proId }] },
		],
	};
	return params;
};

test.concurrent(
	`${chalk.yellowBright("billing-verify schedule-mismatches 1: schedule released externally -> missing_schedule")}`,
	async () => {
		const customerId = "verify-schedule-missing";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});

		const params = buildTwoPhaseSchedule({
			customerId,
			proId: pro.id,
			addonId: addon.id,
		});
		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");
		expect(response.phases).toHaveLength(2);

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { releaseSchedule: true },
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toEqual([
			{
				type: "schedule_mismatch",
				reason: "missing_schedule",
				expected_phase_count: 2,
				actual_phase_count: undefined,
				phase_starts_at: undefined,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify schedule-mismatches 2: future phase item quantity drifted -> mismatch carries phase_starts_at")}`,
	async () => {
		const customerId = "verify-schedule-phase-item";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});

		const params = buildTwoPhaseSchedule({
			customerId,
			proId: pro.id,
			addonId: addon.id,
		});
		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		expect(sub.schedule).toBeTruthy();
		const scheduleId =
			typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
		if (!scheduleId) throw new Error("Expected schedule id on sub");

		const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			scheduleId,
			{
				expand: ["phases.items.price"],
			},
		);
		expect(schedule.phases.length).toBe(2);

		const secondPhase = schedule.phases[1];
		const updatedPhases = schedule.phases.map((phase, index) => ({
			start_date: phase.start_date,
			end_date: phase.end_date,
			proration_behavior: "none" as const,
			items: phase.items.map((item, itemIndex) => ({
				price: typeof item.price === "string" ? item.price : item.price.id,
				quantity:
					index === 1 && itemIndex === 0
						? (item.quantity ?? 1) + 1
						: item.quantity,
			})),
		}));

		await ctx.stripeCli.subscriptionSchedules.update(scheduleId, {
			phases: updatedPhases,
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches.length).toBeGreaterThan(0);
		for (const mismatch of result.subscriptions[0].mismatches) {
			const phaseStartsAt = (mismatch as { phase_starts_at?: number })
				.phase_starts_at;
			expect(phaseStartsAt).toBe(secondPhase.start_date);
		}
	},
);
