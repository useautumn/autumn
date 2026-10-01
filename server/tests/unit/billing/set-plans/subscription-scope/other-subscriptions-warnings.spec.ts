import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { setPlansPreviewToWarnings } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPreviewToWarnings";
import { scopeOver } from "./subscriptionScopeFixtures";

const warningsFor = (otherStripeSubscriptionIds?: string[]) =>
	setPlansPreviewToWarnings({
		phases: [],
		liveProcessorItems: [],
		processorChanges: [],
		withdrawnCustomerProducts: [],
		outgoingCustomerProducts: [],
		features: [],
		billingContext: { currentEpochMs: 0, billingCycleAnchorMs: "now" },
		stripeBillingPlan: {},
		replacedOpenInvoices: [],
		liveOpenInvoices: [],
		requestedAnchorResetMs: undefined,
		stripeSubscriptionScope: otherStripeSubscriptionIds
			? scopeOver({ customerProducts: [], otherStripeSubscriptionIds })
			: undefined,
	});

describe(chalk.yellowBright("other_subscriptions_unaffected warning"), () => {
	test("tells the user how many other subscriptions stay as they are", () => {
		expect(warningsFor(["sub_b", "sub_c"])).toEqual([
			{
				type: "other_subscriptions_unaffected",
				severity: "info",
				message: "Plans on 2 other subscriptions aren't affected.",
				parts: [
					{ text: "Plans on" },
					{ text: "2 other subscriptions", bold: true },
					{ text: "aren't affected." },
				],
			},
		]);
		expect(warningsFor(["sub_b"])[0]?.message).toBe(
			"Plans on 1 other subscription aren't affected.",
		);
	});

	test("is absent without a target or other subscriptions", () => {
		expect(warningsFor()).toEqual([]);
		expect(warningsFor([])).toEqual([]);
	});
});
