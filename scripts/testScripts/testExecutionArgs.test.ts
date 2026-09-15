import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestArgv } from "../tw/helpers/remoteExecutor";
import { getTestExecutionArgs } from "./testExecutionArgs";

test("TW uses the shared bounded execution settings without skipping teardown", () => {
	const argv = buildTestArgv("fixture.test.ts");
	expect(argv.slice(argv.indexOf("test") + 1, -1)).toEqual(
		getTestExecutionArgs(),
	);
	expect(argv.some((arg) => arg.startsWith("--bail"))).toBe(false);
});

test("a test timeout kills its child process and still runs teardown", async () => {
	const directory = await mkdtemp(join(tmpdir(), "tw-test-timeout-"));
	try {
		await writeFile(
			join(directory, "fixture.test.ts"),
			`
import {test, afterAll} from "bun:test";
afterAll(() => console.log("TEARDOWN FINISHED"));
test("pending", async () => {
 const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { stdout: "ignore", stderr: "ignore" });
 await Bun.write("child.pid", String(child.pid));
 await new Promise(() => {});
});
`,
		);
		const child = Bun.spawn(
			[
				process.execPath,
				"test",
				...getTestExecutionArgs({ timeoutMs: 150 }),
				"fixture.test.ts",
			],
			{
				cwd: directory,
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const watchdog = setTimeout(() => child.kill(9), 2000);
		const started = performance.now();
		try {
			const [exitCode, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);
			expect(exitCode).toBe(1);
			expect(stdout).toContain("TEARDOWN FINISHED");
			expect(stderr).toContain("timed out after 150ms");
			expect(stderr).toContain("killed 1 dangling process");
			expect(performance.now() - started).toBeLessThan(1500);
		} finally {
			clearTimeout(watchdog);
			child.kill();
		}
	} finally {
		const pidText = await readFile(join(directory, "child.pid"), "utf8").catch(
			() => undefined,
		);
		if (pidText) {
			try {
				process.kill(Number(pidText), "SIGKILL");
			} catch {}
		}
		await rm(directory, { recursive: true, force: true });
	}
});
