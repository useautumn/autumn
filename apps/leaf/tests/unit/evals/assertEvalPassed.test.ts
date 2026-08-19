import { afterEach, describe, expect, test } from "bun:test";
import {
	assertEvalPassed,
	evalFailures,
	FAIL_ON_SCORE_ENV,
} from "../../evals/harness/assertEvalPassed.js";

const result = ({
	caseName,
	error,
	scores,
}: {
	caseName: string;
	error?: unknown;
	scores: Record<string, number | null>;
}) =>
	({
		error,
		expected: {},
		input: {},
		metadata: { caseName },
		output: {},
		scores,
	}) as never;

describe("evalFailures", () => {
	test("reports scorers below 1, null scores and thrown cases by case name", () => {
		expect(
			evalFailures({
				results: [
					result({ caseName: "happy", scores: { a: 1, b: 1 } }),
					result({ caseName: "low", scores: { a: 0, b: 1 } }),
					result({ caseName: "missing", scores: { a: null } }),
					result({ caseName: "threw", error: new Error("boom"), scores: {} }),
				],
			}),
		).toEqual([
			{ caseName: "low", reasons: ["a: 0"] },
			{ caseName: "missing", reasons: ["a: null"] },
			{ caseName: "threw", reasons: ["error: Error: boom"] },
		]);
	});
});

describe("assertEvalPassed", () => {
	const originalEnv = process.env[FAIL_ON_SCORE_ENV];
	afterEach(() => {
		process.exitCode = 0;
		if (originalEnv === undefined) delete process.env[FAIL_ON_SCORE_ENV];
		else process.env[FAIL_ON_SCORE_ENV] = originalEnv;
	});

	test("is a no-op unless opted in", () => {
		delete process.env[FAIL_ON_SCORE_ENV];
		assertEvalPassed({
			evaluation: { results: [result({ caseName: "low", scores: { a: 0 } })] },
			experimentName: "x",
		});
		expect(process.exitCode ?? 0).toBe(0);
	});

	test("sets a failing exit code when opted in and a case fails", () => {
		process.env[FAIL_ON_SCORE_ENV] = "1";
		assertEvalPassed({
			evaluation: { results: [result({ caseName: "low", scores: { a: 0 } })] },
			experimentName: "x",
		});
		expect(process.exitCode).toBe(1);
	});

	test("leaves the exit code alone when every case passes", () => {
		process.env[FAIL_ON_SCORE_ENV] = "1";
		assertEvalPassed({
			evaluation: { results: [result({ caseName: "ok", scores: { a: 1 } })] },
			experimentName: "x",
		});
		expect(process.exitCode ?? 0).toBe(0);
	});
});
