import { afterAll, describe, expect, test } from "bun:test";
import path from "node:path";

const FIXTURE = path.join(import.meta.dir, "fixtures/recycleClusterFixture.ts");
const PORT = 39000 + Math.floor(Math.random() * 1000);

let fixture: ReturnType<typeof Bun.spawn> | null = null;

afterAll(() => {
	fixture?.kill();
});

describe("fork recycling in a real bun cluster", () => {
	test(
		"serves every request across repeated recycles and rotates pids",
		async () => {
			const stdoutLines: string[] = [];
			fixture = Bun.spawn({
				cmd: [process.execPath, FIXTURE],
				env: {
					...process.env,
					FIXTURE_PORT: String(PORT),
					// Any RSS qualifies; forks recycle as soon as they're old enough.
					FORK_RECYCLE_RSS_MB: "1",
					FORK_RECYCLE_MIN_AGE_MS: "500",
					FORK_RECYCLE_CHECK_INTERVAL_MS: "150",
					FORK_RECYCLE_DRAIN_TIMEOUT_MS: "5000",
				},
				stdout: "pipe",
				stderr: "pipe",
			});

			// stdout is a stream because the spawn above pipes it.
			const stdout = fixture.stdout as ReadableStream<Uint8Array>;
			const reader = stdout.getReader();
			const decoder = new TextDecoder();
			let buffered = "";
			const pump = (async () => {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffered += decoder.decode(value);
					const lines = buffered.split("\n");
					buffered = lines.pop() ?? "";
					stdoutLines.push(...lines);
				}
			})();

			const waitFor = async (predicate: () => boolean, timeoutMs: number) => {
				const deadline = Date.now() + timeoutMs;
				while (!predicate()) {
					if (Date.now() > deadline) return false;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				return true;
			};

			const workerUpCount = () =>
				stdoutLines.filter((line) => line.startsWith("WORKER_UP")).length;

			expect(await waitFor(() => workerUpCount() >= 2, 15_000)).toBe(true);

			// Drive sequential traffic through several recycle generations.
			const servedByPid = new Set<string>();
			let failures = 0;
			const trafficDeadline = Date.now() + 8_000;
			while (Date.now() < trafficDeadline) {
				try {
					const response = await fetch(`http://127.0.0.1:${PORT}/`);
					const body = await response.text();
					if (!response.ok || !body.startsWith("ok:")) {
						failures++;
					} else {
						servedByPid.add(body.slice(3));
					}
				} catch {
					failures++;
				}
				await new Promise((resolve) => setTimeout(resolve, 25));
			}

			expect(failures).toBe(0);
			// Two boot forks plus at least two recycled replacements served traffic.
			expect(servedByPid.size).toBeGreaterThanOrEqual(4);
			// Every exit was a coordinated recycle, never a crash respawn.
			expect(
				stdoutLines.filter((line) => line.startsWith("WORKER_DIED")),
			).toHaveLength(0);
			expect(
				stdoutLines.some((line) => line.includes("requesting recycle")),
			).toBe(true);

			fixture.kill();
			await pump.catch(() => {});
		},
		{ timeout: 40_000 },
	);
});
