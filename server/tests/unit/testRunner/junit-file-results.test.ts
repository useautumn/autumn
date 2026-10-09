import { describe, expect, test } from "bun:test";
import { junitFileResults } from "../../testRunner/junitFileResults";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4">
  <testsuite name="tests/unit/a.test.ts" file="tests/unit/a.test.ts" tests="3" time="0">
    <testcase name="ok" classname="" time="0.25" file="tests/unit/a.test.ts" line="2" />
    <testcase name="it&apos;s bad" classname="" time="0.5" file="tests/unit/a.test.ts" line="3">
      <failure type="AssertionError" />
    </testcase>
    <testcase name="sk" classname="" time="0" file="tests/unit/a.test.ts" line="4">
      <skipped />
    </testcase>
  </testsuite>
  <testsuite name="tests/unit/c.test.ts" file="tests/unit/c.test.ts" tests="1" time="0">
    <testcase name="sk" classname="" time="0" file="tests/unit/c.test.ts" line="2">
      <skipped />
    </testcase>
  </testsuite>
</testsuites>`;

const PATHS = [
	"tests/unit/a.test.ts",
	"tests/unit/b.test.ts",
	"tests/unit/c.test.ts",
];

describe("junitFileResults", () => {
	test("rolls test cases up per file, and a file without cases in a failed shard crashed", () => {
		expect(
			junitFileResults({ xml: XML, paths: PATHS, shardFailed: true }),
		).toEqual([
			{
				file: "tests/unit/a.test.ts",
				status: "failed",
				durationMs: 750,
				passedTests: 1,
				failedTests: 1,
				failureSummary: "it's bad",
			},
			{
				file: "tests/unit/b.test.ts",
				status: "crashed",
				durationMs: 0,
				passedTests: 0,
				failedTests: 0,
				failureSummary:
					"No test reported: the file failed before its tests ran.",
			},
			{
				file: "tests/unit/c.test.ts",
				status: "skipped",
				durationMs: 0,
				passedTests: 0,
				failedTests: 0,
				failureSummary: null,
			},
		]);
	});

	test("a file without cases in a passing shard is left out", () => {
		const files = junitFileResults({
			xml: XML,
			paths: PATHS,
			shardFailed: false,
		}).map((r) => r.file);
		expect(files).toEqual(["tests/unit/a.test.ts", "tests/unit/c.test.ts"]);
	});

	test("a missing report in a failed shard marks every file crashed", () => {
		const statuses = junitFileResults({
			xml: "",
			paths: PATHS,
			shardFailed: true,
		}).map((r) => r.status);
		expect(statuses).toEqual(["crashed", "crashed", "crashed"]);
	});
});
