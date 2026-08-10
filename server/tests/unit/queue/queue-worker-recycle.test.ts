import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";

const FIXTURE_PATH = new URL(
	"./fixtures/recycle-polling-worker.ts",
	import.meta.url,
).pathname;

const waitForNaturalExit = async ({
	child,
	timeoutMs,
}: {
	child: ReturnType<typeof spawn>;
	timeoutMs: number;
}): Promise<boolean> => {
	if (child.exitCode !== null || child.signalCode !== null) return true;

	return await new Promise((resolve) => {
		const timeout = setTimeout(() => resolve(false), timeoutMs);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve(true);
		});
	});
};

// Queue workers previously had no process-level proof that their 50k threshold
// ACKs the triggering batch before exiting for a cluster replacement.
describe("SQS queue worker recycling", () => {
	test("acknowledges the threshold batch before the worker exits", async () => {
		const child = spawn("bun", [FIXTURE_PATH], {
			cwd: process.cwd(),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		// Generous: a cold-cache CI bun boot alone can take seconds; the wait
		// resolves on exit, so healthy runs never pay the full bound.
		const exitedNaturally = await waitForNaturalExit({
			child,
			timeoutMs: 15_000,
		});
		if (!exitedNaturally) {
			child.kill("SIGKILL");
			await new Promise((resolve) => child.once("exit", resolve));
		}

		expect(exitedNaturally, stderr).toBe(true);
		expect(child.exitCode).toBe(0);

		const deleteIndex = stdout.indexOf("DELETE_BATCH 2");
		const recycleIndex = stdout.indexOf("Recycling after 2 messages");
		expect(deleteIndex).toBeGreaterThanOrEqual(0);
		expect(recycleIndex).toBeGreaterThan(deleteIndex);
	});
});
