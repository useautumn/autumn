/**
 * buildStripeSubscriptionUpdateParams / buildStripeSubscriptionCancelParams
 *
 * Contract:
 *   New behaviors:
 *     user subscription_params pass through onto the Stripe payload
 *     reserved keys (items, cancel_at, proration_behavior, metadata, expand, …)
 *       are stripped from the user bag and always taken from Autumn
 *     Autumn-owned keys win collisions even when Autumn sets them
 */

import { describe, expect, test } from "bun:test";
import {
	buildStripeSubscriptionCancelParams,
	buildStripeSubscriptionUpdateParams,
} from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionParams";
import chalk from "chalk";

const userCancellationDetails = {
	cancellation_details: {
		feedback: "too_expensive" as const,
		comment: "Switching to a competitor",
	},
};

describe(chalk.yellowBright("buildStripeSubscriptionUpdateParams"), () => {
	test("keeps user extras and Autumn items", () => {
		const params = buildStripeSubscriptionUpdateParams({
			params: {
				items: [{ id: "si_autumn", quantity: 2 }],
				proration_behavior: "none",
			},
			subscriptionParams: userCancellationDetails,
		});

		expect(params.cancellation_details).toEqual(
			userCancellationDetails.cancellation_details,
		);
		expect(params.items).toEqual([{ id: "si_autumn", quantity: 2 }]);
		expect(params.proration_behavior).toBe("none");
	});

	test("drops user items when Autumn omitted them", () => {
		const params = buildStripeSubscriptionUpdateParams({
			params: { proration_behavior: "none" },
			subscriptionParams: {
				items: [{ id: "si_user", quantity: 99 }],
				...userCancellationDetails,
			},
		});

		expect(params.items).toBeUndefined();
		expect(params.cancellation_details).toEqual(
			userCancellationDetails.cancellation_details,
		);
	});

	test("Autumn items win over user items", () => {
		const params = buildStripeSubscriptionUpdateParams({
			params: { items: [{ id: "si_autumn", quantity: 1 }] },
			subscriptionParams: { items: [{ id: "si_user", quantity: 99 }] },
		});

		expect(params.items).toEqual([{ id: "si_autumn", quantity: 1 }]);
	});

	test("Autumn expand and metadata win", () => {
		const params = buildStripeSubscriptionUpdateParams({
			params: {
				expand: ["latest_invoice"],
				metadata: { autumn_source: "updateSubscription" },
			},
			subscriptionParams: {
				expand: ["customer"],
				metadata: { stolen: "yes" },
			},
		});

		expect(params.expand).toEqual(["latest_invoice"]);
		expect(params.metadata).toEqual({ autumn_source: "updateSubscription" });
	});
});

describe(chalk.yellowBright("buildStripeSubscriptionCancelParams"), () => {
	test("keeps user extras and Autumn expand", () => {
		const params = buildStripeSubscriptionCancelParams({
			params: { expand: ["latest_invoice"] },
			subscriptionParams: userCancellationDetails,
		});

		expect(params.cancellation_details).toEqual(
			userCancellationDetails.cancellation_details,
		);
		expect(params.expand).toEqual(["latest_invoice"]);
	});

	test("Autumn expand wins over user expand", () => {
		const params = buildStripeSubscriptionCancelParams({
			params: { expand: ["latest_invoice"] },
			subscriptionParams: { expand: ["customer"] },
		});

		expect(params.expand).toEqual(["latest_invoice"]);
	});
});
