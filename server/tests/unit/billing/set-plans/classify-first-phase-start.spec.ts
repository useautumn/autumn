import { describe, expect, test } from "bun:test";
import { ms, SET_PLANS_FIRST_PHASE_TOLERANCE_MS } from "@autumn/shared";
import {
	classifyFirstPhaseStart,
	firstPhaseBillingStartsAt,
} from "@/internal/billing/v2/actions/setPlans/setup/classifyFirstPhaseStart";

const currentEpochMs = 1_800_000_000_000;

describe("classifyFirstPhaseStart", () => {
	test.each([
		["exactly now", currentEpochMs, "now"],
		[
			"just inside the tolerance ahead",
			currentEpochMs + SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
			"now",
		],
		[
			"just inside the tolerance behind",
			currentEpochMs - SET_PLANS_FIRST_PHASE_TOLERANCE_MS,
			"now",
		],
		[
			"past the tolerance ahead",
			currentEpochMs + SET_PLANS_FIRST_PHASE_TOLERANCE_MS + 1,
			"future",
		],
		["a day ahead", currentEpochMs + ms.days(1), "future"],
		[
			"past the tolerance behind",
			currentEpochMs - SET_PLANS_FIRST_PHASE_TOLERANCE_MS - 1,
			"past",
		],
	])("%s", (_label, startsAt, expected) => {
		expect(classifyFirstPhaseStart({ startsAt, currentEpochMs })).toBe(
			expected as ReturnType<typeof classifyFirstPhaseStart>,
		);
	});
});

describe("firstPhaseBillingStartsAt", () => {
	test.each([
		[
			"10 min ahead bills from now",
			currentEpochMs + ms.minutes(10),
			currentEpochMs,
		],
		[
			"10 min behind bills from now",
			currentEpochMs - ms.minutes(10),
			currentEpochMs,
		],
		[
			"20 min ahead keeps its start",
			currentEpochMs + ms.minutes(20),
			currentEpochMs + ms.minutes(20),
		],
		[
			"20 min behind keeps its start",
			currentEpochMs - ms.minutes(20),
			currentEpochMs - ms.minutes(20),
		],
	])("%s", (_label, startsAt, expected) => {
		expect(firstPhaseBillingStartsAt({ startsAt, currentEpochMs })).toBe(
			expected,
		);
	});
});
