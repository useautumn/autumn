import { describe, expect, test } from "bun:test";
import { countsAsBaseline } from "./countsAsBaseline.ts";
import { BASELINE_BRANCH } from "./refreshBaselines.ts";

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

const devRun = {
	purpose: "adhoc" as const,
	branch: BASELINE_BRANCH,
	repeat: 1,
	fullSuite: true,
	sha: HEAD,
	devHeadSha: HEAD,
};

describe("countsAsBaseline", () => {
	test("a scheduled dev baseline run counts, whatever it selected", () => {
		expect(
			countsAsBaseline({
				...devRun,
				purpose: "baseline",
				fullSuite: false,
				devHeadSha: null,
			}),
		).toBe(true);
	});

	test("a manual full-suite dev run at dev's HEAD counts", () => {
		expect(countsAsBaseline(devRun)).toBe(true);
	});

	test("a full-suite dev run of an older commit does not count", () => {
		expect(countsAsBaseline({ ...devRun, sha: OLD })).toBe(false);
	});

	test("a dev run of a subset (groups, files or grep) does not count", () => {
		expect(countsAsBaseline({ ...devRun, fullSuite: false })).toBe(false);
	});

	test("an unknown dev HEAD (GitHub unreachable) does not count", () => {
		expect(countsAsBaseline({ ...devRun, devHeadSha: null })).toBe(false);
	});

	test("repeat runs never count", () => {
		expect(countsAsBaseline({ ...devRun, repeat: 3 })).toBe(false);
		expect(
			countsAsBaseline({ ...devRun, purpose: "baseline", repeat: 3 }),
		).toBe(false);
	});

	test("runs on other branches never count, even scheduled ones", () => {
		expect(countsAsBaseline({ ...devRun, branch: "feat/x" })).toBe(false);
		expect(
			countsAsBaseline({ ...devRun, branch: "feat/x", purpose: "baseline" }),
		).toBe(false);
	});
});
