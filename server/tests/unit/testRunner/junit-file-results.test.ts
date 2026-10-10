import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	filesWithoutCases,
	junitFileResults,
} from "../../testRunner/junitFileResults";

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
	test("rolls cases up per file as twd test ids; a listed case-less file is crashed", () => {
		expect(
			junitFileResults({
				xml: XML,
				paths: PATHS,
				crashedFiles: new Set(["tests/unit/b.test.ts"]),
			}),
		).toEqual([
			{
				file: "unit/a.test.ts",
				status: "failed",
				durationMs: 750,
				passedTests: 1,
				failedTests: 1,
				failureSummary: "it's bad",
			},
			{
				file: "unit/b.test.ts",
				status: "crashed",
				durationMs: 0,
				passedTests: 0,
				failedTests: 0,
				failureSummary:
					"No test reported: the file failed before its tests ran.",
			},
			{
				file: "unit/c.test.ts",
				status: "skipped",
				durationMs: 0,
				passedTests: 0,
				failedTests: 0,
				failureSummary: null,
			},
		]);
	});

	test("an unlisted case-less file (e.g. fully commented out) is left out", () => {
		expect(filesWithoutCases({ xml: XML, paths: PATHS })).toEqual([
			"tests/unit/b.test.ts",
		]);
		const files = junitFileResults({
			xml: XML,
			paths: PATHS,
			crashedFiles: new Set(),
		}).map((r) => r.file);
		expect(files).toEqual(["unit/a.test.ts", "unit/c.test.ts"]);
	});
});

describe("junitFileResults on real bun reporter output", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "junit-real-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	test("passing, failing, skipped and empty files", async () => {
		const files = {
			"pass.test.ts": `import { test } from "bun:test";\ntest("p", () => {});`,
			"fail.test.ts": `import { expect, test } from "bun:test";\ntest("f", () => expect(1).toBe(2));`,
			"skip.test.ts": `import { test } from "bun:test";\ntest.skip("s", () => {});`,
			"empty.test.ts": `// import { test } from "bun:test";`,
		};
		for (const [name, body] of Object.entries(files))
			writeFileSync(path.join(dir, name), body);
		const paths = Object.keys(files).map((name) => `./${name}`);
		const outfile = path.join(dir, "out.xml");
		const proc = Bun.spawn(
			[
				"bun",
				"test",
				"--reporter=junit",
				`--reporter-outfile=${outfile}`,
				...paths,
			],
			{
				cwd: dir,
				env: { ...process.env, UNIT_TESTS: "" },
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		expect(await proc.exited).toBe(1);
		const xml = await Bun.file(outfile).text();
		const ids = paths.map((p) => p.replace("./", ""));

		expect(filesWithoutCases({ xml, paths: ids })).toEqual(["empty.test.ts"]);
		expect(
			junitFileResults({ xml, paths: ids, crashedFiles: new Set() }).map(
				(r) => [r.file, r.status],
			),
		).toEqual([
			["pass.test.ts", "passed"],
			["fail.test.ts", "failed"],
			["skip.test.ts", "skipped"],
		]);
	});
});
