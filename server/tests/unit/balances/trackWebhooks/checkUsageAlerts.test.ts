import { describe, expect, test } from "bun:test";
import type { ApiBalanceV1, DbUsageAlert } from "@autumn/shared";
import { wasThresholdCrossed } from "@/internal/balances/trackWebhooks/checkUsageAlerts.js";

const balance = ({
	usage,
	granted = 1000,
	remaining = granted - usage,
}: {
	usage: number;
	granted?: number;
	remaining?: number;
}): ApiBalanceV1 =>
	({
		object: "balance",
		feature_id: "messages",
		granted,
		remaining,
		usage,
		unlimited: false,
		overage_allowed: false,
		max_purchase: null,
		next_reset_at: null,
	}) as ApiBalanceV1;

const alert = ({
	threshold,
	threshold_type,
}: Pick<DbUsageAlert, "threshold" | "threshold_type">): DbUsageAlert => ({
	threshold,
	threshold_type,
	enabled: true,
	feature_id: "messages",
});

describe("wasThresholdCrossed", () => {
	test("usage alert fires when usage lands exactly on threshold", () => {
		expect(
			wasThresholdCrossed({
				alert: alert({ threshold: 500, threshold_type: "usage" }),
				oldApiBalance: balance({ usage: 490 }),
				newApiBalance: balance({ usage: 500 }),
			}),
		).toBe(true);
	});

	test("usage alert does not refire when usage was already at threshold", () => {
		expect(
			wasThresholdCrossed({
				alert: alert({ threshold: 500, threshold_type: "usage" }),
				oldApiBalance: balance({ usage: 500 }),
				newApiBalance: balance({ usage: 510 }),
			}),
		).toBe(false);
	});

	test("usage percentage alert fires when usage lands exactly on threshold", () => {
		expect(
			wasThresholdCrossed({
				alert: alert({
					threshold: 100,
					threshold_type: "usage_percentage",
				}),
				oldApiBalance: balance({ usage: 990 }),
				newApiBalance: balance({ usage: 1000 }),
			}),
		).toBe(true);
	});

	test("usage percentage alert does not refire when already at threshold", () => {
		expect(
			wasThresholdCrossed({
				alert: alert({
					threshold: 100,
					threshold_type: "usage_percentage",
				}),
				oldApiBalance: balance({ usage: 1000 }),
				newApiBalance: balance({ usage: 1010 }),
			}),
		).toBe(false);
	});

	test("remaining threshold behavior is already inclusive on the new value", () => {
		expect(
			wasThresholdCrossed({
				alert: alert({ threshold: 200, threshold_type: "remaining" }),
				oldApiBalance: balance({ usage: 790, remaining: 210 }),
				newApiBalance: balance({ usage: 800, remaining: 200 }),
			}),
		).toBe(true);
	});
});
