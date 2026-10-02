import { describe, expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	classifyFirstPhaseStart,
	FIRST_PHASE_TOLERANCE_MS,
} from "@/internal/billing/v2/actions/setPlans/setup/classifyFirstPhaseStart";

const currentEpochMs = 1_800_000_000_000;

describe("classifyFirstPhaseStart", () => {
	test.each([
		["exactly now", currentEpochMs, "now"],
		[
			"just inside the tolerance ahead",
			currentEpochMs + FIRST_PHASE_TOLERANCE_MS,
			"now",
		],
		[
			"just inside the tolerance behind",
			currentEpochMs - FIRST_PHASE_TOLERANCE_MS,
			"now",
		],
		[
			"past the tolerance ahead",
			currentEpochMs + FIRST_PHASE_TOLERANCE_MS + 1,
			"future",
		],
		["a day ahead", currentEpochMs + ms.days(1), "future"],
		[
			"past the tolerance behind",
			currentEpochMs - FIRST_PHASE_TOLERANCE_MS - 1,
			"past",
		],
	])("%s", (_label, startsAt, expected) => {
		expect(classifyFirstPhaseStart({ startsAt, currentEpochMs })).toBe(
			expected as ReturnType<typeof classifyFirstPhaseStart>,
		);
	});
});
