import { describe, expect, test } from "bun:test";
import { shouldUseTrackV3 } from "@/internal/balances/track/runTrackWithRollout.js";

describe("runTrackWithRollout", () => {
	test("enables track v3 now that the FullSubject rollout is complete", () => {
		expect(
			shouldUseTrackV3({
				ctx: {
					rolloutSnapshot: undefined,
				} as never,
			}),
		).toBe(true);
	});
});
