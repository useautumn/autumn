import { describe, expect, test } from "bun:test";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import { getReleasedStripeScheduleId } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleStripeScheduleReleased/getReleasedStripeScheduleId";

const contextWith = ({
	schedule,
	previousSchedule,
}: {
	schedule: string | null;
	previousSchedule?: string | null;
}) =>
	({
		stripeSubscription: { schedule },
		previousAttributes:
			previousSchedule === undefined ? {} : { schedule: previousSchedule },
	}) as unknown as StripeSubscriptionUpdatedContext;

describe("getReleasedStripeScheduleId", () => {
	test("returns the schedule the subscription just lost", () => {
		expect(
			getReleasedStripeScheduleId({
				subscriptionUpdatedContext: contextWith({
					schedule: null,
					previousSchedule: "sub_sched_123",
				}),
			}),
		).toBe("sub_sched_123");
	});

	test("ignores an event that did not touch the schedule", () => {
		expect(
			getReleasedStripeScheduleId({
				subscriptionUpdatedContext: contextWith({ schedule: null }),
			}),
		).toBeNull();
	});

	test("ignores a schedule being replaced by another", () => {
		expect(
			getReleasedStripeScheduleId({
				subscriptionUpdatedContext: contextWith({
					schedule: "sub_sched_456",
					previousSchedule: "sub_sched_123",
				}),
			}),
		).toBeNull();
	});

	test("ignores a schedule being attached", () => {
		expect(
			getReleasedStripeScheduleId({
				subscriptionUpdatedContext: contextWith({
					schedule: "sub_sched_123",
					previousSchedule: null,
				}),
			}),
		).toBeNull();
	});
});
