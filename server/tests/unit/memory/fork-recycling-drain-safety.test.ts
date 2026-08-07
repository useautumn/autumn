import { afterAll, describe, expect, test } from "bun:test";
import path from "node:path";

const FIXTURE = path.join(import.meta.dir, "fixtures/recycleLoadFixture.ts");
const PORT = 41000 + Math.floor(Math.random() * 2000);

let fixture: ReturnType<typeof Bun.spawn> | null = null;

afterAll(() => {
	fixture?.kill();
});

type Outcome = { ok: boolean; pid?: string; reason?: string };

const call = async (url: string): Promise<Outcome> => {
	try {
		const response = await fetch(url);
		const body = await response.text();
		if (!response.ok) return { ok: false, reason: `status ${response.status}` };
		const [prefix, pid, padding] = body.split(":");
		if (prefix !== "ok" || padding?.length !== 512) {
			return { ok: false, reason: `truncated body (${body.length}b)` };
		}
		return { ok: true, pid };
	} catch (error) {
		return { ok: false, reason: (error as Error).message };
	}
};

describe("drain safety under concurrent load", () => {
	test(
		"no request is dropped or truncated across repeated recycles",
		async () => {
			const stdoutLines: string[] = [];
			fixture = Bun.spawn({
				cmd: [process.execPath, FIXTURE],
				env: {
					...process.env,
					FIXTURE_PORT: String(PORT),
					FIXTURE_FORKS: "3",
					FORK_RECYCLE_RSS_MB: "1",
					FORK_RECYCLE_MIN_AGE_MS: "600",
					FORK_RECYCLE_CHECK_INTERVAL_MS: "1000",
					FORK_RECYCLE_DRAIN_TIMEOUT_MS: "1000",
					FORK_RECYCLE_DISABLED: "false",
				},
				stdout: "pipe",
				stderr: "pipe",
			});

			const reader = (fixture.stdout as ReadableStream<Uint8Array>).getReader();
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

			try {
				const waitFor = async (predicate: () => boolean, timeoutMs: number) => {
					const deadline = Date.now() + timeoutMs;
					while (!predicate()) {
						if (Date.now() > deadline) return false;
						await new Promise((resolve) => setTimeout(resolve, 50));
					}
					return true;
				};

				const bootedForks = () =>
					stdoutLines.filter((line) => line.startsWith("WORKER_UP")).length;
				expect(await waitFor(() => bootedForks() >= 3, 20_000)).toBe(true);

				const base = `http://127.0.0.1:${PORT}`;
				const outcomes: Outcome[] = [];
				const servingPids = new Set<string>();
				const until = Date.now() + 12_000;

				// 24 concurrent fast callers plus 4 slow ones whose 3s response
				// straddles a recycle, so a drain that cut early would truncate.
				const fastCaller = async () => {
					while (Date.now() < until) {
						const outcome = await call(`${base}/?ms=15`);
						outcomes.push(outcome);
						if (outcome.pid) servingPids.add(outcome.pid);
					}
				};
				const slowCaller = async () => {
					while (Date.now() < until) {
						const outcome = await call(`${base}/slow?ms=3000`);
						outcomes.push(outcome);
						if (outcome.pid) servingPids.add(outcome.pid);
					}
				};

				await Promise.all([
					...Array.from({ length: 24 }, fastCaller),
					...Array.from({ length: 4 }, slowCaller),
				]);

				const failures = outcomes.filter((outcome) => !outcome.ok);
				const recycleCount = stdoutLines.filter((line) =>
					line.includes("recycled"),
				).length;

				console.log(
					`requests=${outcomes.length} failures=${failures.length} recycles=${recycleCount} distinctPids=${servingPids.size}`,
				);
				if (failures.length > 0) {
					console.log("first failures:", failures.slice(0, 5));
				}
				const extended = stdoutLines.filter((line) =>
					line.includes("extending drain"),
				);
				console.log(
					`drain extensions=${extended.length} maxDrainExceeded=${
						stdoutLines.filter((l) => l.includes("max drain exceeded")).length
					}`,
				);

				// Recycles actually happened, and nothing was dropped or cut.
				expect(recycleCount).toBeGreaterThanOrEqual(3);
				expect(servingPids.size).toBeGreaterThanOrEqual(5);
				expect(failures).toHaveLength(0);
				// Without this the suite could stop exercising the case it exists for:
				// a slow request must push the drain deadline back, not get cut.
				expect(extended.length).toBeGreaterThan(0);
				expect(
					stdoutLines.filter((line) => line.includes("max drain exceeded")),
				).toHaveLength(0);
				expect(
					stdoutLines.filter((line) => line.startsWith("WORKER_DIED")),
				).toHaveLength(0);
			} finally {
				fixture.kill();
				await pump.catch(() => {});
			}
		},
		{ timeout: 90_000 },
	);
});
