/**
 * An auto-sync skip means a real Stripe change was NOT applied to Autumn, so
 * it must be a warning with a filterable reason. Only skips where there was
 * nothing for Autumn to apply stay at info.
 *
 * Red (before): every skip was a free-text info line, so seat changes skipped
 *               for `base_quantity_gt_one` or `ambiguous_linked_targets` drifted
 *               unnoticed.
 * Green (after): warn + structured `skip_reason`, info only for routine reasons.
 */
import { describe, expect, mock, test } from "bun:test";
import { logAutoSyncSkip } from "@/internal/billing/v2/actions/sync/utils/logAutoSyncSkip";

const fakeLogger = () => ({ info: mock(), warn: mock() });

describe("logAutoSyncSkip", () => {
	test("a skipped Stripe change is a warning carrying its reason", () => {
		const logger = fakeLogger();
		logAutoSyncSkip({
			logger,
			source: "sub.updated",
			stripeSubscriptionId: "sub_123",
			reason: "base_quantity_gt_one",
			details: "Plan team is not an add-on",
		});

		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			"sub.updated auto-sync skipping sub_123: base_quantity_gt_one - Plan team is not an add-on",
			{
				data: {
					type: "stripe_auto_sync_skip",
					source: "sub.updated",
					stripe_subscription_id: "sub_123",
					skip_reason: "base_quantity_gt_one",
				},
			},
		);
	});

	test("nothing for Autumn to apply stays at info", () => {
		for (const reason of ["no_matched_plans", "no_changed_targets"] as const) {
			const logger = fakeLogger();
			logAutoSyncSkip({
				logger,
				source: "sub.created",
				stripeSubscriptionId: "sub_123",
				reason,
			});

			expect(logger.warn).not.toHaveBeenCalled();
			expect(logger.info).toHaveBeenCalledWith(
				`sub.created auto-sync skipping sub_123: ${reason}`,
				expect.objectContaining({
					data: expect.objectContaining({ skip_reason: reason }),
				}),
			);
		}
	});

	test("a schedule-only skip is recorded under stripe_schedule_id", () => {
		const logger = fakeLogger();
		logAutoSyncSkip({
			logger,
			source: "customer.create",
			stripeSubscriptionId: null,
			stripeScheduleId: "sub_sched_123",
			reason: "multiple_main_plans",
		});

		expect(logger.warn).toHaveBeenCalledWith(
			"customer.create auto-sync skipping sub_sched_123: multiple_main_plans",
			{
				data: {
					type: "stripe_auto_sync_skip",
					source: "customer.create",
					stripe_subscription_id: null,
					stripe_schedule_id: "sub_sched_123",
					skip_reason: "multiple_main_plans",
				},
			},
		);
	});
});
