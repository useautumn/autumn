import { describe, expect, test } from "bun:test";
import type { DevResult } from "../types/resultsSchemas.ts";
import { classifyDevResults } from "./classifyDevResults.ts";

const r = (status: DevResult["status"], attempt = 1): DevResult => ({
	status,
	attempt,
	sha: "a".repeat(40),
	source: "ci",
	runId: "ci_x",
	at: "2026-10-09T00:00:00.000Z",
});

const classify = (file: string, recent: DevResult[]) =>
	classifyDevResults({ file, recent });

describe("classifyDevResults", () => {
	test("all first-try passes is passed", () => {
		const s = classify("unit/a.test.ts", [r("passed"), r("passed")]);
		expect([s.status, s.passRate, s.samples]).toEqual(["passed", 1, 2]);
	});

	test("the latest two failing is failing, even after older passes", () => {
		const s = classify("unit/a.test.ts", [
			r("failed"),
			r("timed_out"),
			r("passed"),
		]);
		expect(s.status).toBe("failing");
		expect(s.passRate).toBeCloseTo(1 / 3);
	});

	test("a single failing result is failing", () => {
		expect(classify("unit/a.test.ts", [r("crashed")]).status).toBe("failing");
	});

	test("mixed results are flaky", () => {
		expect(
			classify("unit/a.test.ts", [r("failed"), r("passed"), r("failed")])
				.status,
		).toBe("flaky");
		expect(
			classify("unit/a.test.ts", [r("passed"), r("failed"), r("failed")])
				.status,
		).toBe("flaky");
	});

	test("passing only on retry is flaky", () => {
		expect(
			classify("unit/a.test.ts", [r("passed", 2), r("passed")]).status,
		).toBe("flaky");
	});

	test("skipped results never count as a pass", () => {
		const s = classify("unit/a.test.ts", [r("skipped"), r("failed")]);
		expect([s.status, s.samples]).toEqual(["failing", 1]);
		const skippedOnly = classify("unit/a.test.ts", [r("skipped")]);
		expect([skippedOnly.status, skippedOnly.passRate]).toEqual([
			"no_data",
			null,
		]);
		expect(skippedOnly.reason).toContain("skipped");
	});

	test("no results is no_data with a reason that depends on where the file comes from", () => {
		const unit = classify("unit/a.test.ts", []);
		expect([unit.status, unit.passRate, unit.latest]).toEqual([
			"no_data",
			null,
			null,
		]);
		expect(unit.reason).toContain("Server Unit Tests CI upload");
		expect(classify("integration/a.test.ts", []).reason).toContain(
			"not in any dev baseline",
		);
	});
});
