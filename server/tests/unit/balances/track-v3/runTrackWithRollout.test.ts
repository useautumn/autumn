import { describe, expect, test } from "bun:test";
import { shouldUseTrackV3 } from "@/internal/balances/track/runTrackWithRollout.js";

describe("runTrackWithRollout", () => {
	test("keeps track v3 disabled when rollout is off", () => {
		expect(
			shouldUseTrackV3({
				ctx: {
					rolloutSnapshot: undefined,
				} as never,
			}),
		).toBe(false);
	});

	test("enables track v3 when v2-cache rollout is enabled", () => {
		expect(
			shouldUseTrackV3({
				ctx: {
					rolloutSnapshot: {
						rolloutId: "v2-cache",
						enabled: true,
						percent: 100,
						previousPercent: 0,
						changedAt: 1,
						customerBucket: 5,
					},
				} as never,
			}),
		).toBe(true);
	});
});
