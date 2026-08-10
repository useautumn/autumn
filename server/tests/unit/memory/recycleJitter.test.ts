import { describe, expect, test } from "bun:test";
import {
	FORK_RECYCLE_DEFAULTS,
	jitterRecycleTriggers,
} from "@/utils/memory/forkRecycling/recyclePolicy.js";

const MB = 1024 * 1024;
const BASE_THRESHOLD = 1536 * MB;
const BASE_MIN_AGE = 30 * 60_000;

describe("jitterRecycleTriggers", () => {
	test("random=0 keeps the base threshold and the full min age", () => {
		const triggers = jitterRecycleTriggers({
			rssThresholdBytes: BASE_THRESHOLD,
			minAgeMs: BASE_MIN_AGE,
			random: () => 0,
		});
		expect(triggers.rssThresholdBytes).toBe(BASE_THRESHOLD);
		expect(triggers.minAgeMs).toBe(BASE_MIN_AGE);
	});

	test("random=1 caps at +30% threshold and -15% min age", () => {
		const triggers = jitterRecycleTriggers({
			rssThresholdBytes: BASE_THRESHOLD,
			minAgeMs: BASE_MIN_AGE,
			random: () => 1,
		});
		expect(triggers.rssThresholdBytes).toBe(Math.round(BASE_THRESHOLD * 1.3));
		expect(triggers.minAgeMs).toBe(Math.round(BASE_MIN_AGE * 0.85));
	});

	test("threshold and age use independent draws", () => {
		const draws = [0, 1];
		const triggers = jitterRecycleTriggers({
			rssThresholdBytes: BASE_THRESHOLD,
			minAgeMs: BASE_MIN_AGE,
			random: () => draws.shift() ?? 0,
		});
		expect(triggers.rssThresholdBytes).toBe(BASE_THRESHOLD);
		expect(triggers.minAgeMs).toBe(Math.round(BASE_MIN_AGE * 0.85));
	});

	test("default rolls stay inside the band", () => {
		for (let i = 0; i < 200; i++) {
			const triggers = jitterRecycleTriggers({
				rssThresholdBytes: FORK_RECYCLE_DEFAULTS.rssThresholdBytes,
				minAgeMs: FORK_RECYCLE_DEFAULTS.minAgeMs,
			});
			expect(triggers.rssThresholdBytes).toBeGreaterThanOrEqual(BASE_THRESHOLD);
			expect(triggers.rssThresholdBytes).toBeLessThanOrEqual(
				Math.round(BASE_THRESHOLD * 1.3),
			);
			expect(triggers.minAgeMs).toBeGreaterThanOrEqual(
				Math.round(BASE_MIN_AGE * 0.85),
			);
			expect(triggers.minAgeMs).toBeLessThanOrEqual(BASE_MIN_AGE);
		}
	});
});
