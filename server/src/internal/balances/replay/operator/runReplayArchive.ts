import { buildReplayManifestCohorts } from "../manifest/buildReplayManifestCohorts.js";
import type { ReplayManifest } from "../manifest/replayManifestContracts.js";
import type { ReplayHydrationCoordinator } from "../replayHydrationContracts.js";
import type {
	ReplayArchiveClock,
	ReplayArchiveConfig,
	ReplayArchiveReport,
	ReplayContextReader,
} from "./replayArchiveContracts.js";
import { prewarmReplayCohorts } from "./replayArchivePrewarm.js";
import { buildReplayArchiveReport } from "./replayArchiveReport.js";
import { replayCohorts } from "./replayArchiveRequests.js";
import {
	createReplayArchiveClock,
	parseReplayArchiveSettings,
} from "./replayArchiveSchedule.js";
import { createReplayStartPacer } from "./replayStartPacer.js";

export type {
	ReplayArchiveClock,
	ReplayArchiveConfig,
	ReplayArchiveReport,
	ReplayArchiveTotals,
	ReplayPrewarmReport,
	ReplayPrewarmStatus,
	ReplayRequestOutcome,
	ReplayRequestReport,
} from "./replayArchiveContracts.js";

/** A signal that never aborts keeps every downstream port on one code path. */
const createIdleSignal = (): AbortSignal => new AbortController().signal;

/** Replays a whole archive: hydrate every selected customer, wait for that
 *  barrier, then replay the manifest under bounded lanes and global pacing.
 *  The caller owns the coordinator and closes it. */
export async function runReplayArchive({
	manifest,
	coordinator,
	readContext,
	config,
	clock,
	signal,
}: {
	manifest: ReplayManifest;
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayContextReader;
	config?: ReplayArchiveConfig;
	clock?: ReplayArchiveClock;
	signal?: AbortSignal;
}): Promise<ReplayArchiveReport> {
	const settings = parseReplayArchiveSettings({ config });
	const runClock = clock ?? createReplayArchiveClock();
	const runSignal = signal ?? createIdleSignal();
	const cohorts = buildReplayManifestCohorts({ manifest });
	const startedAtMs = runClock.now();
	const plans = await prewarmReplayCohorts({
		cohorts,
		baseline: manifest.baseline,
		coordinator,
		concurrency: settings.concurrency,
		signal: runSignal,
	});
	const prewarmEndedAtMs = runClock.now();
	const outcomes = await replayCohorts({
		plans,
		coordinator,
		readContext,
		pacer: createReplayStartPacer({
			intervalMs: settings.intervalMs,
			clock: runClock,
			signal: runSignal,
		}),
		clock: runClock,
		concurrency: settings.concurrency,
		signal: runSignal,
	});
	return buildReplayArchiveReport({
		manifest,
		plans,
		outcomes,
		prewarmDurationMs: prewarmEndedAtMs - startedAtMs,
		measuredDurationMs: runClock.now() - prewarmEndedAtMs,
	});
}
