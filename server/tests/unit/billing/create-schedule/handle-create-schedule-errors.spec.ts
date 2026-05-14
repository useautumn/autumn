import { describe, expect, test } from "bun:test";
import type { CreateScheduleBillingContext } from "@autumn/shared";
import { ms } from "@autumn/shared";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle";
import type Stripe from "stripe";
import { handleCreateScheduleErrors } from "@/internal/billing/v2/actions/createSchedule/errors/handleCreateScheduleErrors";

const db = undefined as unknown as DrizzleCli;

const buildContext = ({
	immediateStartsAt,
	currentEpochMs,
	existingSchedule,
}: {
	immediateStartsAt: number;
	currentEpochMs: number;
	existingSchedule?: Stripe.SubscriptionSchedule;
}) =>
	({
		currentEpochMs,
		immediatePhase: {
			starts_at: immediateStartsAt,
			plans: [{ plan_id: "plan" }],
		},
		stripeSubscriptionSchedule: existingSchedule,
		productContexts: [],
		fullProducts: [],
		scheduledPhaseContexts: [],
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

	test("rejects creation when the immediate phase is far in the past", async () => {
		const now = Date.now();

		await expect(
			handleCreateScheduleErrors({
				db,
				billingContext: buildContext({
					immediateStartsAt: now - ms.hours(1),
					currentEpochMs: now,
				}),
			}),
		).rejects.toThrow("The first phase must start immediately");
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
