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

import { expect, spyOn, test as testSequentially } from "bun:test";
import {
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
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

testSequentially(
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
		expect(result.subscriptions[0].mismatches).toMatchObject([
			{
				type: "schedule_mismatch",
				reason: "missing_schedule",
				expected_phase_count: 2,
			},
		]);
	},
);

// Delayed verification previously reported phase_start_mismatch for an unchanged current phase.
// Phase zero must stay valid while genuine future-phase drift remains detectable.
testSequentially(
	`${chalk.yellowBright("billing-verify schedule-mismatches 2: delayed verification accepts current phase and detects future drift")}`,
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
		const verificationNow = Date.now() + ms.days(3);
		const dateNow = spyOn(Date, "now").mockReturnValue(verificationNow);

		try {
			const unchanged = await verify({
				ctx,
				params: { customer_id: customerId },
			});
			expect(unchanged.subscriptions[0].mismatches).toEqual([]);
			expect(unchanged.subscriptions[0].status).toBe("correct");

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

			const drifted = await verify({
				ctx,
				params: { customer_id: customerId },
			});

			expect(drifted.subscriptions[0].status).toBe("mismatched");
			expect(drifted.subscriptions[0].mismatches.length).toBeGreaterThan(0);
			for (const mismatch of drifted.subscriptions[0].mismatches) {
				const phaseStartsAt = (mismatch as { phase_starts_at?: number })
					.phase_starts_at;
				expect(phaseStartsAt).toBe(secondPhase.start_date);
			}
		} finally {
			dateNow.mockRestore();
		}
	},
);

testSequentially(
	`${chalk.yellowBright("billing-verify schedule-mismatches 3: Stripe schedule Autumn doesn't expect -> unexpected_schedule with phase dates")}`,
	async () => {
		const customerId = "verify-schedule-unexpected";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		// A Stripe-side schedule Autumn knows nothing about: the current phase
		// plus a future custom-renewal phase.
		const schedule = await ctx.stripeCli.subscriptionSchedules.create({
			from_subscription: sub.id,
		});
		const currentPhase = schedule.phases[0];
		const futurePrice = await ctx.stripeCli.prices.create({
			product: sub.items.data[0].price.product as string,
			currency: sub.items.data[0].price.currency,
			unit_amount: 910000,
			recurring: { interval: "year", interval_count: 1 },
			nickname: "custom-renewal",
		});
		await ctx.stripeCli.subscriptionSchedules.update(schedule.id, {
			phases: [
				{
					start_date: currentPhase.start_date,
					end_date: currentPhase.end_date,
					items: sub.items.data.map((item) => ({
						price: item.price.id,
						...(item.price.recurring?.usage_type === "licensed"
							? { quantity: item.quantity ?? 1 }
							: {}),
					})),
				},
				{
					items: [{ price: futurePrice.id, quantity: 1 }],
					end_date: currentPhase.end_date + 365 * 24 * 3600,
				},
			],
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		// ── Contract: schedule finding with phase dates, not a cancel misread ─
		expect(result.subscriptions[0].status).toBe("mismatched");
		const scheduleMismatch = result.subscriptions[0].mismatches.find(
			(mismatch) => mismatch.type === "schedule_mismatch",
		);
		expect(scheduleMismatch).toMatchObject({
			reason: "unexpected_schedule",
			actual_phase_starts_at: [currentPhase.end_date],
		});
		expect(scheduleMismatch?.message).toContain("not in Autumn");
		expect(
			result.subscriptions[0].mismatches.some(
				(mismatch) => mismatch.type === "cancel_state_mismatch",
			),
		).toBe(false);
	},
);

// Phase matching tolerates a day of drift, so an extra Stripe phase landing
// within that window could be claimed by an expected phase that already
// matched, hiding it. Each expected phase may claim only one actual phase.
testSequentially(
	`${chalk.yellowBright("billing-verify schedule-mismatches 4: an extra phase inside the day tolerance is still reported")}`,
	async () => {
		const customerId = "verify-schedule-extra-phase";

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

		const response = await autumnV1.billing.createSchedule(
			buildTwoPhaseSchedule({ customerId, proId: pro.id, addonId: addon.id }),
		);
		expect(response.status).toBe("created");

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const scheduleId =
			typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
		if (!scheduleId) throw new Error("Expected schedule id on sub");

		const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			scheduleId,
			{ expand: ["phases.items.price"] },
		);
		const [firstPhase, secondPhase] = schedule.phases;

		// Split the final phase in two: the second half starts 12h later, well
		// inside similarUnix's day tolerance.
		const splitAt = secondPhase.start_date + 12 * 3600;
		const phaseItems = (phase: (typeof schedule.phases)[number]) =>
			phase.items.map((item) => ({
				price: typeof item.price === "string" ? item.price : item.price.id,
				quantity: item.quantity ?? undefined,
			}));

		await ctx.stripeCli.subscriptionSchedules.update(scheduleId, {
			phases: [
				{
					start_date: firstPhase.start_date,
					end_date: firstPhase.end_date,
					proration_behavior: "none",
					items: phaseItems(firstPhase),
				},
				{
					start_date: secondPhase.start_date,
					end_date: splitAt,
					proration_behavior: "none",
					items: phaseItems(secondPhase),
				},
				{
					start_date: splitAt,
					end_date: secondPhase.end_date,
					proration_behavior: "none",
					items: phaseItems(secondPhase),
				},
			],
		});

		// ── Contract: the extra phase is reported, not absorbed by the
		// tolerance window of the phase Autumn does expect ─────────────────
		const result = await verify({ ctx, params: { customer_id: customerId } });
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(
			result.subscriptions[0].mismatches.some(
				(mismatch) =>
					mismatch.type === "schedule_mismatch" &&
					mismatch.reason === "phase_count_mismatch",
			),
		).toBe(true);
	},
);

// Mintlify's report: a scheduled cusProduct carries no subscription_ids and is
// reachable only through the schedule. Selecting related products by
// subscription alone drops it, so Autumn's expected phases collapse to one and
// the real Stripe schedule reads as unexpected.
testSequentially(
	`${chalk.yellowBright("billing-verify schedule-mismatches 5: schedule-only-linked cusProduct is not reported as unexpected")}`,
	async () => {
		const customerId = "verify-schedule-link-only";

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

		const response = await autumnV1.billing.createSchedule(
			buildTwoPhaseSchedule({ customerId, proId: pro.id, addonId: addon.id }),
		);
		expect(response.status).toBe("created");

		// Reproduce the prod shape: the scheduled rows keep only scheduled_ids.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const scheduledProducts = fullCustomer.customer_products.filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		);
		expect(scheduledProducts.length).toBeGreaterThan(0);
		for (const scheduled of scheduledProducts) {
			expect(scheduled.scheduled_ids?.length).toBeGreaterThan(0);
			await ctx.db
				.update(customerProducts)
				.set({ subscription_ids: null })
				.where(eq(customerProducts.id, scheduled.id));
		}

		// ── Contract: the future phase is still part of the expected state, so
		// the schedule Autumn created is not reported as unexpected ─────────
		const result = await verify({ ctx, params: { customer_id: customerId } });
		expect(
			result.subscriptions[0].mismatches.filter(
				(mismatch) =>
					mismatch.type === "schedule_mismatch" &&
					mismatch.reason === "unexpected_schedule",
			),
		).toEqual([]);
		expect(result.subscriptions[0].status).toBe("correct");
	},
);
