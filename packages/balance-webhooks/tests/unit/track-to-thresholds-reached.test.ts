import { describe, expect, test } from "bun:test";
import type { MutationEffect, TrackResult } from "@autumn/balance-engine";
import { WebhookEventType } from "@autumn/shared";
import {
	type FundingBalance,
	type ThresholdReached,
	trackToThresholdsReached,
} from "../../src/balanceWebhooks.js";

const trackResult = ({
	deducted,
	status = "applied",
	fundingFeatureId = "messages",
	fundingCreditCost = 1,
}: {
	deducted: number;
	status?: TrackResult["status"];
	fundingFeatureId?: string;
	fundingCreditCost?: number;
}): TrackResult => ({
	type: "track",
	status,
	reason: status === "rejected" ? "insufficient_balance" : null,
	deltas:
		status === "rejected"
			? []
			: [
					{
						table: "customerEntitlements",
						id: "ent_1",
						entityKey: null,
						balanceDelta: -deducted,
						usageDelta: deducted,
						valueDelta: deducted / fundingCreditCost,
						creditCost: fundingCreditCost,
					},
				],
	deductions: [],
	internalProductId: null,
	fundingFeatureId,
	fundingCreditCost,
});

/** The balance after the track: 100 granted, `usage` used so far. */
const balanceAfter = ({
	usage,
	unlimited = false,
}: {
	usage: number;
	unlimited?: boolean;
}): FundingBalance => ({ granted: 100, usage, unlimited });

const limitReachedEffect = ({
	featureId,
}: {
	featureId: string;
}): MutationEffect => ({
	type: "balance_webhook",
	eventType: WebhookEventType.BalancesLimitReached,
	data: { customer_id: "cus_1", feature_id: featureId, limit_type: "included" },
	tags: [],
});

const thresholdsOf = ({
	effects = [],
	result,
	fundingBalance,
}: {
	effects?: MutationEffect[];
	result: TrackResult;
	fundingBalance: FundingBalance;
}) => trackToThresholdsReached({ effects, result, fundingBalance });

describe("trackToThresholdsReached: limit_reached", () => {
	test("a limit_reached webhook is a limit_reached threshold, and the allowance is not reported too", () => {
		expect(
			thresholdsOf({
				effects: [limitReachedEffect({ featureId: "messages" })],
				result: trackResult({ deducted: 10 }),
				fundingBalance: balanceAfter({ usage: 100 }),
			}),
		).toEqual([{ featureId: "messages", type: "limit_reached" }]);
	});

	test("other effects, and a limit_reached without a feature id, cross nothing", () => {
		expect(
			thresholdsOf({
				effects: [
					{
						type: "auto_topup",
						featureId: "messages",
						reason: "balance_below_threshold",
					},
					{
						type: "balance_webhook",
						eventType: WebhookEventType.BalancesLimitReached,
						data: { customer_id: "cus_1" },
						tags: [],
					},
				],
				result: trackResult({ deducted: 10 }),
				fundingBalance: balanceAfter({ usage: 20 }),
			}),
		).toEqual([]);
	});
});

describe("trackToThresholdsReached: allowance_used", () => {
	const allowanceUsed: ThresholdReached[] = [
		{ featureId: "messages", type: "allowance_used" },
	];

	test("the track that empties the included balance used the allowance", () => {
		expect(
			thresholdsOf({
				result: trackResult({ deducted: 10 }),
				fundingBalance: balanceAfter({ usage: 100 }),
			}),
		).toEqual(allowanceUsed);
	});

	test("the track that runs past it into overage used the allowance", () => {
		expect(
			thresholdsOf({
				result: trackResult({ deducted: 20 }),
				fundingBalance: balanceAfter({ usage: 110 }),
			}),
		).toEqual(allowanceUsed);
	});

	test("a track that leaves at least one unit crosses nothing", () => {
		expect(
			thresholdsOf({
				result: trackResult({ deducted: 10 }),
				fundingBalance: balanceAfter({ usage: 99 }),
			}),
		).toEqual([]);
	});

	test("a track already in overage does not use the allowance again", () => {
		expect(
			thresholdsOf({
				result: trackResult({ deducted: 10 }),
				fundingBalance: balanceAfter({ usage: 120 }),
			}),
		).toEqual([]);
	});

	test("one unit is the funding cost: credits at 0.2 each cross below 0.2 remaining", () => {
		expect(
			thresholdsOf({
				result: trackResult({
					deducted: 0.2,
					fundingFeatureId: "credits",
					fundingCreditCost: 0.2,
				}),
				fundingBalance: balanceAfter({ usage: 99.9 }),
			}),
		).toEqual([{ featureId: "credits", type: "allowance_used" }]);
	});

	test("a rejected track, a refund and an unlimited balance cross nothing", () => {
		expect(
			thresholdsOf({
				result: trackResult({ deducted: 0, status: "rejected" }),
				fundingBalance: balanceAfter({ usage: 100 }),
			}),
		).toEqual([]);
		expect(
			thresholdsOf({
				result: trackResult({ deducted: -10 }),
				fundingBalance: balanceAfter({ usage: 100 }),
			}),
		).toEqual([]);
		expect(
			thresholdsOf({
				result: trackResult({ deducted: 10 }),
				fundingBalance: balanceAfter({ usage: 100, unlimited: true }),
			}),
		).toEqual([]);
	});
});
