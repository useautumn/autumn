import { describe, expect, test } from "bun:test";
import { formatStripeObjectId } from "@/views/customers2/components/sheets/set-plans-subscription/utils/formatStripeObjectId";
import { stripeSubscriptionIntervalLabel } from "@/views/customers2/components/sheets/set-plans-subscription/utils/stripeSubscriptionIntervalLabel";
import {
	stripeSubscriptionToRenewal,
	subscriptionRenewalLabel,
} from "@/views/customers2/components/sheets/set-plans-subscription/utils/subscriptionRenewal";
import {
	makeStripeSubscription,
	PERIOD_END_SECONDS,
	PERIOD_START_SECONDS,
} from "./setPlansSubscriptionFixtures";

const RENEWAL_DATE_MS = Date.UTC(2026, 9, 3, 12);

describe("stripeSubscriptionToRenewal", () => {
	test("renews at the current period end", () => {
		expect(
			stripeSubscriptionToRenewal({
				subscription: makeStripeSubscription({ id: "sub_a" }),
			}),
		).toEqual({ kind: "renews", date: PERIOD_END_SECONDS * 1000 });
	});

	test("a past-due subscription failed at its period start", () => {
		expect(
			stripeSubscriptionToRenewal({
				subscription: makeStripeSubscription({
					id: "sub_a",
					status: "past_due",
					cancelAtPeriodEnd: true,
				}),
			}),
		).toEqual({ kind: "payment_failed", date: PERIOD_START_SECONDS * 1000 });
	});

	test("an unpaid subscription reads as a failed payment, not a renewal", () => {
		expect(
			stripeSubscriptionToRenewal({
				subscription: makeStripeSubscription({ id: "sub_a", status: "unpaid" }),
			}),
		).toEqual({ kind: "payment_failed", date: PERIOD_START_SECONDS * 1000 });
	});

	test("cancel_at wins over the period end", () => {
		const cancelAt = PERIOD_START_SECONDS + 100;
		expect(
			stripeSubscriptionToRenewal({
				subscription: makeStripeSubscription({ id: "sub_a", cancelAt }),
			}),
		).toEqual({ kind: "cancels", date: cancelAt * 1000 });
	});
});

describe("subscriptionRenewalLabel", () => {
	test("labels each renewal kind", () => {
		expect(
			subscriptionRenewalLabel({
				renewal: { kind: "renews", date: RENEWAL_DATE_MS },
			}),
		).toBe("Oct 3, 2026");
		expect(
			subscriptionRenewalLabel({
				renewal: { kind: "payment_failed", date: RENEWAL_DATE_MS },
			}),
		).toBe("Failed Oct 3, 2026");
		expect(
			subscriptionRenewalLabel({
				renewal: { kind: "cancels", date: RENEWAL_DATE_MS },
			}),
		).toBe("Cancels Oct 3, 2026");
		expect(
			subscriptionRenewalLabel({
				renewal: { kind: "starts", date: RENEWAL_DATE_MS },
			}),
		).toBe("Starts Oct 3, 2026");
		expect(subscriptionRenewalLabel({ renewal: { kind: "none" } })).toBe("—");
	});
});

describe("stripeSubscriptionIntervalLabel", () => {
	test("names common cadences", () => {
		const label = (interval: "month" | "year" | "week", intervalCount = 1) =>
			stripeSubscriptionIntervalLabel({
				subscription: makeStripeSubscription({
					id: "sub_a",
					interval,
					intervalCount,
				}),
			});

		expect(label("month")).toBe("Monthly");
		expect(label("year")).toBe("Yearly");
		expect(label("month", 3)).toBe("Quarterly");
		expect(label("week", 2)).toBe("Every 2 weeks");
	});

	test("a mixed-interval subscription reads as its longest cadence, whatever the item order", () => {
		const monthly = makeStripeSubscription({ id: "sub_a" }).items.data[0];
		const yearly = makeStripeSubscription({ id: "sub_a", interval: "year" })
			.items.data[0];
		const subscription = makeStripeSubscription({ id: "sub_a" });

		expect(
			stripeSubscriptionIntervalLabel({
				subscription: {
					...subscription,
					items: { ...subscription.items, data: [monthly, yearly] },
				},
			}),
		).toBe("Yearly");
	});
});

describe("formatStripeObjectId", () => {
	test("shortens long ids around the type prefix", () => {
		expect(formatStripeObjectId("sub_1QxAbcdefgh8aKd")).toBe("sub_1QxA…8aKd");
		expect(formatStripeObjectId("sub_sched_1QxAbcdefgh8aKd")).toBe(
			"sub_sched_1QxA…8aKd",
		);
		expect(formatStripeObjectId("sub_short")).toBe("sub_short");
	});
});
