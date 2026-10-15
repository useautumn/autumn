import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";

const FIXTURE_PATH = new URL(
	"./fixtures/shutdown-flush-worker.ts",
	import.meta.url,
).pathname;

const runWorkerUntilExit = async () => {
	const child = spawn("bun", [FIXTURE_PATH], {
		cwd: process.cwd(),
		env: { ...process.env, NODE_ENV: "production" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout?.on("data", (chunk) => {
		output += chunk.toString();
	});
	child.stderr?.on("data", (chunk) => {
		output += chunk.toString();
	});

	const exited = await new Promise<boolean>((resolve) => {
		const timeout = setTimeout(() => resolve(false), 20_000);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve(true);
		});
	});
	if (!exited) child.kill("SIGKILL");
	return { exited, output };
};

describe("SQS worker shutdown", () => {
	test("delivers usage events batched by a job still running at SIGTERM", async () => {
		const { exited, output } = await runWorkerUntilExit();

		expect(exited, output).toBe(true);
		expect(output).toContain("JOB_FINISHED");
		expect(output, output).toContain("SQS_SENT insert-event-batch events=1");
		expect(output, output).toContain("TINYBIRD_SENT events=1");
		expect(output).not.toContain("SqsBatchShuttingDownError");
	}, 30_000);
});
