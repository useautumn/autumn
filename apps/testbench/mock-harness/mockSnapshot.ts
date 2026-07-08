import type { FileRow, Snapshot } from "../src/types";

const STATUSES: FileRow["status"][] = [
	"passed",
	"passed",
	"passed",
	"failed",
	"running",
	"retrying",
];

/** Deterministic pseudo-random so screenshots are reproducible run-to-run. */
const seeded = (seed: number) => {
	let state = seed;
	return () => {
		state = (state * 48_271) % 2_147_483_647;
		return state / 2_147_483_647;
	};
};

export const buildMockSnapshot = (): Snapshot => {
	const rand = seeded(42);
	const now = Date.now();
	const files: FileRow[] = [];
	for (let index = 0; index < 60; index++) {
		const status = STATUSES[index % STATUSES.length];
		// Log-spread durations across 5s–400s so every histogram bucket gets hits.
		const durationMs = Math.round(5000 * (400 / 5) ** rand()) + index * 37;
		const done = status === "passed" || status === "failed";
		files.push({
			file: `server/tests/mock/file${index}.test.ts`,
			name: `mock/file${index}`,
			status,
			passed: status === "failed" ? 3 : 5,
			failed: status === "failed" ? 2 : 0,
			worker: `w${index % 8}`,
			durationMs: done || status === "retrying" ? durationMs : undefined,
			willRetry: status === "retrying",
			failedTests:
				status === "failed"
					? [{ name: `test ${index}`, message: "expected 1 to be 2" }]
					: [],
		});
	}
	const completions = Array.from(
		{ length: 40 },
		(_, index) => now - 120_000 + index * 3000 + Math.round(rand() * 1500),
	);
	return {
		phase: "run",
		target: "mock",
		workerCount: 8,
		warmActivity: "",
		warmBuilding: false,
		warmStage: 5,
		phaseStartedAt: now - 300_000,
		activity: "mock harness snapshot",
		fanout: { stripeDone: 8, stripeTotal: 8, workersReady: 8, workersTotal: 8 },
		teardown: {
			sandboxesDone: 0,
			sandboxesTotal: 8,
			accountsDone: 0,
			accountsTotal: 8,
		},
		run: {
			total: 60,
			done: 40,
			passed: 30,
			failed: 10,
			running: 10,
			retrying: 10,
			skipped: 0,
		},
		files,
		workers: Array.from({ length: 8 }, (_, index) => ({
			name: `w${index}`,
			status: "ready" as const,
			fileCount: 8,
			files: [],
		})),
		completions,
		runStartedAt: now - 192_000,
		summary: null,
		now,
	};
};
