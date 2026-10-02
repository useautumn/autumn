import { describe, expect, test } from "bun:test";
import { BASELINE_BRANCH, feedsBaseline } from "./refreshBaselines.ts";

describe("feedsBaseline", () => {
	test("a finished dev baseline run feeds the baseline", () => {
		expect(
			feedsBaseline({
				purpose: "baseline",
				branch: BASELINE_BRANCH,
				repeat: 1,
			}),
		).toBe(true);
	});

	test("repeat runs never feed the baseline", () => {
		expect(
			feedsBaseline({
				purpose: "baseline",
				branch: BASELINE_BRANCH,
				repeat: 3,
			}),
		).toBe(false);
		expect(
			feedsBaseline({ purpose: "adhoc", branch: BASELINE_BRANCH, repeat: 10 }),
		).toBe(false);
	});

	test("adhoc and non-dev runs never feed the baseline", () => {
		expect(
			feedsBaseline({ purpose: "adhoc", branch: BASELINE_BRANCH, repeat: 1 }),
		).toBe(false);
		expect(
			feedsBaseline({ purpose: "baseline", branch: "feat/x", repeat: 1 }),
		).toBe(false);
	});
});
