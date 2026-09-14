/**
 * sub.updated back-sync must ignore an Autumn-owned schedule advancing (Autumn's
 * mirror already applied the phase), but still run for schedules the customer
 * built in Stripe (e.g. license quantity changes).
 */

import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { isAutumnScheduledPhaseChange } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/isAutumnScheduledPhaseChange";
import type { StripeSubscriptionUpdatedContext } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";
import { AUTUMN_STRIPE_METADATA_KEYS } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";

const itemsChanged = {
	items: { object: "list", data: [], has_more: false, url: "" },
} as unknown as StripeSubscriptionUpdatedContext["previousAttributes"];

const buildContext = ({
	schedule,
	previousAttributes = itemsChanged,
}: {
	schedule: Partial<Stripe.SubscriptionSchedule> | null;
	previousAttributes?: StripeSubscriptionUpdatedContext["previousAttributes"];
}) =>
	({
		stripeSubscription: { id: "sub_test", schedule },
		previousAttributes,
	}) as unknown as StripeSubscriptionUpdatedContext;

describe("isAutumnScheduledPhaseChange", () => {
	test("true when an Autumn-stamped schedule advances", () => {
		const context = buildContext({
			schedule: {
				id: "sub_sched_autumn",
				metadata: { [AUTUMN_STRIPE_METADATA_KEYS.managedAt]: "1" },
			},
		});
		expect(
			isAutumnScheduledPhaseChange({ subscriptionUpdatedContext: context }),
		).toBe(true);
	});

	test("false when a customer-built Stripe schedule advances", () => {
		const context = buildContext({
			schedule: { id: "sub_sched_external", metadata: {} },
		});
		expect(
			isAutumnScheduledPhaseChange({ subscriptionUpdatedContext: context }),
		).toBe(false);
	});

	test("false when items change with no schedule attached", () => {
		const context = buildContext({ schedule: null });
		expect(
			isAutumnScheduledPhaseChange({ subscriptionUpdatedContext: context }),
		).toBe(false);
	});

	test("false when an Autumn schedule is attached but items did not change", () => {
		const context = buildContext({
			schedule: {
				id: "sub_sched_autumn",
				metadata: { [AUTUMN_STRIPE_METADATA_KEYS.managedAt]: "1" },
			},
			previousAttributes: { status: "active" },
		});
		expect(
			isAutumnScheduledPhaseChange({ subscriptionUpdatedContext: context }),
		).toBe(false);
	});
});
