import { describe, expect, test } from "bun:test";
import type { CreateScheduleBillingContext, FullProduct } from "@autumn/shared";
import { addInterval, BillingInterval, ms } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle";
import { handleCreateScheduleErrors } from "@/internal/billing/v2/actions/createSchedule/errors/handleCreateScheduleErrors";
import { STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT } from "@/internal/billing/v2/utils/stripeBackdateStartDateUtils";

const db = undefined as unknown as DrizzleCli;

const buildContext = ({
	immediateStartsAt,
	currentEpochMs,
	existingSchedule,
	fullProducts = [],
	checkoutMode,
}: {
	immediateStartsAt: number;
	currentEpochMs: number;
	existingSchedule?: Stripe.SubscriptionSchedule;
	fullProducts?: FullProduct[];
	checkoutMode?: "stripe_checkout";
}) =>
	({
		currentEpochMs,
		immediatePhase: {
			starts_at: immediateStartsAt,
			plans: [{ plan_id: "plan" }],
		},
		stripeSubscriptionSchedule: existingSchedule,
		checkoutMode,
		productContexts: [],
		scheduledPhaseContexts: [],
		fullProducts,
		fullCustomer: {
			internal_id: "internal_cus_123",
			customer_products: [],
		},
	}) as unknown as CreateScheduleBillingContext;

describe(chalk.yellowBright("handleCreateScheduleErrors"), () => {
	test("allows an immediate phase within the tolerance window", async () => {
		const now = Date.now();

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now,
					currentEpochMs: now,
				}),
			}),
		).resolves.toBeUndefined();
	});

	test("rejects creation when a past immediate phase has no paid recurring products", async () => {
		const now = Date.now();

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now - ms.hours(1),
					currentEpochMs: now,
				}),
			}),
		).rejects.toThrow(
			"Past first phase starts_at is only supported for paid recurring plans",
		);
	});

	test("allows creation when the immediate phase is a supported backdate", async () => {
		const now = Date.now();
		const pro = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now - ms.hours(1),
					currentEpochMs: now,
					fullProducts: [pro],
				}),
			}),
		).resolves.toBeUndefined();
	});

	test("rejects creation when a backdated first invoice would exceed Stripe's line item limit", async () => {
		const now = Date.UTC(2026, 4, 29);
		const pro = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});
		const startsAt = addInterval({
			from: now,
			interval: BillingInterval.Month,
			intervalCount: -(STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT + 1),
		});

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: startsAt,
					currentEpochMs: now,
					fullProducts: [pro],
				}),
			}),
		).rejects.toThrow("at most 250 line items");
	});

	test("rejects a backdated checkout-required start at execution time", async () => {
		const now = Date.now();
		const pro = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now - ms.hours(1),
					currentEpochMs: now,
					fullProducts: [pro],
					checkoutMode: "stripe_checkout",
				}),
			}),
		).rejects.toThrow(
			"Past first phase starts_at cannot be used when Stripe Checkout is required",
		);
	});

	test("skips the checkout-required guard during preview", async () => {
		const now = Date.now();
		const pro = products.createFull({
			id: "pro",
			prices: [prices.createFixed({ id: "price_pro" })],
		});

		await expect(
			handleCreateScheduleErrors({
				db,
				preview: true,
				billingContext: buildContext({
					immediateStartsAt: now - ms.hours(1),
					currentEpochMs: now,
					fullProducts: [pro],
					checkoutMode: "stripe_checkout",
				}),
			}),
		).resolves.toBeUndefined();
	});

	test("rejects creation when the immediate phase is far in the future", async () => {
		const now = Date.now();

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now + ms.hours(1),
					currentEpochMs: now,
				}),
			}),
		).rejects.toThrow("The first phase must start immediately");
	});

	test("skips the immediate-start guard on updates (existing schedule)", async () => {
		// Regression: when editing an existing schedule, the frontend preserves
		// the persisted starts_at for phase 0. Downstream Stripe execution anchors
		// the first phase to the schedule's current_phase.start_date anyway, so
		// the tolerance check should not reject a historical starts_at here.
		const now = Date.now();

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now - ms.days(30),
					currentEpochMs: now,
					existingSchedule: {
						id: "sub_sched_existing",
					} as unknown as Stripe.SubscriptionSchedule,
				}),
			}),
		).resolves.toBeUndefined();
	});
});
