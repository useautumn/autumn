import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emulateGoogleUrl } from "./emulate.ts";

describe("emulateGoogleUrl", () => {
	test("uses the emulate origin as-is", () => {
		expect(
			emulateGoogleUrl({
				origin: "https://autumn-wt45-aa11bb-emulate.autumnworktree.com",
			}),
		).toBe("https://autumn-wt45-aa11bb-emulate.autumnworktree.com");
		expect(
			emulateGoogleUrl({
				origin: "https://autumn-wt45-aa11bb-emulate.autumnworktree.com/",
			}),
		).toBe("https://autumn-wt45-aa11bb-emulate.autumnworktree.com");
	});

	test("uses loopback emulate on Cloud when that is the service origin", () => {
		expect(emulateGoogleUrl({ origin: "http://localhost:4000" })).toBe(
			"http://localhost:4000",
		);
	});
});

describe("spawnEmulateDaemon", () => {
	test("lets the owner exit while the daemon remains running", async () => {
		const dir = mkdtempSync(join(tmpdir(), "autumn-emulate-"));
		const logPath = join(dir, "emulate.log");
		const modulePath = join(import.meta.dir, "emulate.ts");
		const daemonCode =
			'process.stdout.write("daemon-ready\\n"); setInterval(() => {}, 1_000)';
		const probeCode = `
			import { spawnEmulateDaemon } from ${JSON.stringify(modulePath)};
			const proc = spawnEmulateDaemon({
				command: [process.execPath, "-e", ${JSON.stringify(daemonCode)}],
				cwd: ${JSON.stringify(dir)},
				logPath: ${JSON.stringify(logPath)},
			});
			console.log(proc.pid);
		`;
		const probe = Bun.spawn([process.execPath, "-e", probeCode], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = new Response(probe.stdout).text();
		const stderr = new Response(probe.stderr).text();
		let daemonPid: number | undefined;

		try {
			const result = await Promise.race([
				probe.exited.then((code) => ({ code })),
				Bun.sleep(1_000).then(() => ({ code: "timeout" as const })),
			]);
			expect(result.code).toBe(0);

			daemonPid = Number((await stdout).trim());
			expect(Number.isInteger(daemonPid)).toBe(true);
			expect(() => process.kill(daemonPid as number, 0)).not.toThrow();

			for (let attempt = 0; attempt < 20; attempt++) {
				if (readFileSync(logPath, "utf8").includes("daemon-ready")) break;
				await Bun.sleep(10);
			}
			expect(readFileSync(logPath, "utf8")).toContain("daemon-ready");
		} catch (error) {
			throw new Error(`${error}\nprobe stderr: ${await stderr}`);
		} finally {
			if (probe.exitCode === null) probe.kill();
			if (daemonPid) {
				try {
					process.kill(daemonPid, "SIGTERM");
				} catch {}
			}
			rmSync(dir, { force: true, recursive: true });
		}
	});
});
