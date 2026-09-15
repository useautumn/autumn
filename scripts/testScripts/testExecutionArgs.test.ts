import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestArgv } from "../tw/helpers/remoteExecutor";
import { getTestExecutionArgs } from "./testExecutionArgs";

test("TW uses the shared bounded, fail-fast execution settings", () => {
	const argv = buildTestArgv("fixture.test.ts");
	expect(argv.slice(argv.indexOf("test") + 1, -1)).toEqual(
		getTestExecutionArgs(),
	);
});

test("a failure ends the test process while a concurrent test is still waiting", async () => {
	const directory = await mkdtemp(join(tmpdir(), "tw-fail-fast-"));
	try {
		await writeFile(
			join(directory, "fixture.test.ts"),
			`
import {test, expect} from "bun:test";
test.concurrent("pending", async () => { console.log("pending started"); await new Promise(() => {}); });
test.concurrent("failure", async () => { await Bun.sleep(20); expect(1).toBe(2); });
`,
		);
		const child = Bun.spawn(
			[process.execPath, "test", ...getTestExecutionArgs(), "fixture.test.ts"],
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
			expect(stdout).toContain("pending started");
			expect(stderr).toContain("Bailed out after 1 failure");
			expect(performance.now() - started).toBeLessThan(1500);
		} finally {
			clearTimeout(watchdog);
			child.kill();
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
