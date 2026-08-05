/**
 * Cross-run per-file wall-duration cache — the input to LONGEST-FIRST (LPT)
 * dispatch.
 *
 * The pLimit window in `tui/runnerCore.ts` admits files in ARRAY order, and the
 * pool grants workers FIFO, so whenever the window is narrower than the file
 * count (`--max` below the suite size, or a pool shrunk by culling) the order the
 * orchestrator hands files over decides the tail: a 4-minute file dispatched last
 * strands the whole run behind it. Classic LPT scheduling says: run the longest
 * jobs FIRST.
 *
 * We can't know a file's cost up front, so we remember it. Every clean attempt
 * records its wall time (`recordFileDuration`, called from the remote executor
 * once a worker is in hand — so queue wait is excluded), and the run merges those
 * into `~/.autumn-tw/file-durations.json` at the end. The next run sorts by that
 * map, longest first, with never-seen files FIRST (an unknown file is treated as
 * potentially the longest).
 *
 * Keys are REPO-RELATIVE paths so the cache is shared across worktrees. The file
 * is a pure optimization hint: a missing, unreadable, or corrupt cache degrades to
 * "everything unknown" (i.e. today's behavior), never to an error.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT, REGISTRY_DIR } from "../constants.ts";

/** Where the merged map lives (sibling of the run registry). */
const DURATIONS_FILE = join(REGISTRY_DIR, "file-durations.json");

/** Ignore absurd values from a corrupt/hand-edited file (ms). */
const MAX_PLAUSIBLE_DURATION_MS = 60 * 60 * 1000;

/** Durations observed in THIS process, keyed repo-relative. */
const observed = new Map<string, number>();

/**
 * Absolute local test path → repo-relative key. Falls back to the path as given
 * (already relative, or outside the repo) so a key is always produced.
 */
const keyOf = (file: string): string =>
	file.startsWith(`${PROJECT_ROOT}/`)
		? file.slice(PROJECT_ROOT.length + 1)
		: file;

/**
 * Record one attempt's wall duration. Retries and worker-death reschedules both
 * land here, so we keep the LONGEST observation for a file — LPT wants the
 * worst-case cost, and under-estimating a long file is exactly the failure mode
 * the ordering exists to avoid.
 */
export const recordFileDuration = (file: string, durationMs: number): void => {
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		return;
	}
	const key = keyOf(file);
	const previous = observed.get(key) ?? 0;
	if (durationMs > previous) {
		observed.set(key, Math.round(durationMs));
	}
};

/** The persisted map, or an empty one when it's missing/unreadable/corrupt. */
export const loadFileDurations = (): Record<string, number> => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(DURATIONS_FILE, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		const clean: Record<string, number> = {};
		for (const [key, value] of Object.entries(
			parsed as Record<string, unknown>,
		)) {
			if (
				typeof value === "number" &&
				Number.isFinite(value) &&
				value > 0 &&
				value < MAX_PLAUSIBLE_DURATION_MS
			) {
				clean[key] = value;
			}
		}
		return clean;
	} catch {
		return {};
	}
};

/**
 * Order files LONGEST-KNOWN-FIRST for dispatch. Files with no recorded duration
 * sort FIRST (unknown ⇒ assume expensive), then known files by descending
 * duration; ties break on path so the order is deterministic run to run.
 */
export const orderByLongestFirst = (files: string[]): string[] => {
	const known = loadFileDurations();
	const durationOf = (file: string): number =>
		known[keyOf(file)] ?? Number.POSITIVE_INFINITY;
	return [...files].sort((a, b) => {
		const durationA = durationOf(a);
		const durationB = durationOf(b);
		// Only the SIGN matters to sort, so an unknown-vs-known compare yielding
		// ±Infinity is exactly right: the unknown side wins and sorts first.
		if (durationA !== durationB) {
			return durationB - durationA;
		}
		// Both unknown, or the same recorded cost → stable by path.
		return a.localeCompare(b);
	});
};

/**
 * Merge this run's observations into the persisted map. Best-effort: a write
 * failure must never fail a run that already produced its verdict. Returns how
 * many files were recorded (0 when there was nothing to persist).
 */
export const persistFileDurations = (): number => {
	if (observed.size === 0) {
		return 0;
	}
	try {
		const merged = loadFileDurations();
		for (const [key, durationMs] of observed) {
			merged[key] = durationMs;
		}
		mkdirSync(REGISTRY_DIR, { recursive: true });
		writeFileSync(DURATIONS_FILE, `${JSON.stringify(merged, null, 2)}\n`);
		return observed.size;
	} catch {
		return 0;
	}
};

/** Path of the persisted map (for log lines / `bun tw doctor`). */
export const fileDurationsPath = (): string => DURATIONS_FILE;
