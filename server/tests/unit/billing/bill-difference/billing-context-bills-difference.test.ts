/** `bill_difference` bills against the period that runs on, so a cycle reset now prorates like Stripe. */

import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import chalk from "chalk";
import {
	billingContextBillsDifference,
	billingContextToProrationNow,
} from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow";

const NOW = 1_700_000_000_000;
const PERIOD = { start: NOW - 1_000_000, end: NOW + 1_000_000 };

const billingContextFor = (
	overrides: Partial<BillingContext> = {},
): BillingContext =>
	({
		requestedProrationBehavior: "bill_difference",
		stripeSubscription: {},
		...overrides,
	}) as unknown as BillingContext;

describe(chalk.yellowBright("billingContextBillsDifference"), () => {
	test("an existing subscription bills the difference from the period start", () => {
		const billingContext = billingContextFor();
		expect(billingContextBillsDifference({ billingContext })).toBe(true);
		expect(
			billingContextToProrationNow({
				billingContext,
				billingPeriod: PERIOD,
				now: NOW,
			}),
		).toBe(PERIOD.start);
	});

	test("a cycle reset now prorates from now", () => {
		const billingContext = billingContextFor({
			requestedBillingCycleAnchor: "now",
		});
		expect(billingContextBillsDifference({ billingContext })).toBe(false);
		expect(
			billingContextToProrationNow({
				billingContext,
				billingPeriod: PERIOD,
				now: NOW,
			}),
		).toBe(NOW);
	});

	test("a scheduled anchor still bills the difference", () => {
		expect(
			billingContextBillsDifference({
				billingContext: billingContextFor({
					requestedBillingCycleAnchor: NOW + 1_000,
				}),
			}),
		).toBe(true);
	});
});
