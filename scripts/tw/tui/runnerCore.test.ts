import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	LocalExecutor,
	type TestExecutor,
} from "../../testScripts/testExecutor";
import { runSwarmTests } from "./runnerCore";
import { getTuiState, resetTui } from "./store";

const directory = await mkdtemp(join(tmpdir(), "tw-output-"));
beforeEach(resetTui);
afterAll(() => rm(directory, { recursive: true, force: true }));

test("streamed stderr verdicts are counted once and retry failures remain visible", async () => {
	let attempts = 0;
	const executor: TestExecutor = {
		async run({ onChunk }) {
			attempts++;
			const stderr =
				attempts === 1 ? "(fail) example [1ms]\n" : "(pass) example [1ms]\n";
			onChunk(stderr);
			return { exitCode: attempts === 1 ? 1 : 0, stderr };
		},
	};

	await runSwarmTests(["example.test.ts"], executor, { maxParallel: 1 });

	expect(getTuiState().files.get("example.test.ts")).toMatchObject({
		status: "passed",
		passed: 1,
		failed: 0,
		attempt: 2,
		passedOnRetry: true,
		failedTests: [{ name: "example" }],
	});
});

test("local execution streams stderr and stdout while retaining stderr diagnostics", async () => {
	const file = join(directory, "local.test.ts");
	await Bun.write(
		file,
		`import { test } from "bun:test";
test("local stderr", () => {
 process.stderr.write("stderr-marker\\n");
 process.stdout.write("stdout-marker\\n");
});
`,
	);
	let output = "";
	const result = await new LocalExecutor().run({
		file,
		onChunk: (chunk) => {
			output += chunk;
		},
	});

	expect(result.exitCode).toBe(0);
	expect(output).toContain("stdout-marker");
	expect(output).toContain("stderr-marker");
	expect(output.match(/\(pass\) local stderr/g)).toHaveLength(1);
	expect(result.stderr).toContain("stderr-marker");
});

test("a process failure without test verdicts keeps its diagnostic", async () => {
	const stderr = "error: Could not resolve dependency\n";
	const executor: TestExecutor = {
		async run({ onChunk }) {
			onChunk(stderr);
			return { exitCode: 1, stderr };
		},
	};

	await runSwarmTests(["broken.test.ts"], executor, { maxParallel: 1 });

	expect(getTuiState().files.get("broken.test.ts")).toMatchObject({
		status: "failed",
		passed: 0,
		failed: 0,
		crashError: stderr.trim(),
	});
});
