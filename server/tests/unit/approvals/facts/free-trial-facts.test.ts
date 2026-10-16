import { describe, expect, test } from "bun:test";
import { FreeTrialDuration, type FullCusProduct } from "@autumn/shared";
import { customerProductToFreeTrialFacts } from "@/internal/approvals/facts/billing/customerProductToFreeTrialFacts";

const NOW = Date.UTC(2026, 0, 15);
const DAY = 24 * 60 * 60 * 1000;

const customerProductWith = ({
	length,
	duration,
	trialEndsAt,
}: {
	length: number;
	duration: FreeTrialDuration;
	trialEndsAt: number;
}) =>
	({
		starts_at: NOW,
		trial_ends_at: trialEndsAt,
		free_trial: { length, duration, card_required: false, on_end: "bill" },
	}) as unknown as FullCusProduct;

describe("customerProductToFreeTrialFacts", () => {
	test("a 14-day trial is a 14-day duration measured from the plan's start", () => {
		expect(
			customerProductToFreeTrialFacts({
				customerProduct: customerProductWith({
					length: 14,
					duration: FreeTrialDuration.Day,
					trialEndsAt: NOW + 14 * DAY,
				}),
				nowMs: NOW,
			}),
		).toEqual({
			duration: { length: 14, unit: "day" },
			starts_at: NOW,
			card_required: false,
			on_end: "bill",
		});
	});

	test("a month trial keeps its unit", () => {
		expect(
			customerProductToFreeTrialFacts({
				customerProduct: customerProductWith({
					length: 1,
					duration: FreeTrialDuration.Month,
					trialEndsAt: NOW + 31 * DAY,
				}),
				nowMs: NOW,
			})?.duration,
		).toEqual({ length: 1, unit: "month" });
	});

	test("an ended trial is no trial", () => {
		expect(
			customerProductToFreeTrialFacts({
				customerProduct: customerProductWith({
					length: 7,
					duration: FreeTrialDuration.Day,
					trialEndsAt: NOW - DAY,
				}),
				nowMs: NOW,
			}),
		).toBeNull();
	});
});
