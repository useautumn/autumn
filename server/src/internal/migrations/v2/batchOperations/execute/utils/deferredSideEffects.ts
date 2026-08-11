import type { Logger } from "@/external/logtail/logtailUtils.js";
import { BATCH_MIGRATION_DEFERRED_INFLIGHT } from "./batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./pagePhaseTimings.js";

export type DeferredSideEffects = {
	/** Start `run` off the critical path. Never throws. */
	defer: (run: () => Promise<unknown>) => void;
	/** Block until in-flight work is under the cap. Never throws. */
	settle: () => Promise<void>;
	/** Await everything started so far and log any failures. Never throws. */
	drain: () => Promise<void>;
};

/**
 * Tracks a page's post-commit side effects (cache invalidation, item events)
 * so they run off the critical path. Pages touch disjoint customers, so they
 * overlap safely.
 *
 * Rejections are captured at defer time rather than left on the promise: an
 * orphaned rejected promise surfaces as an unhandledRejection and kills the
 * worker, and a rejecting `Promise.race` would abort the page loop.
 *
 * `phase` names the drain's timing entry, e.g. "finalize_caches_drain".
 */
export const createDeferredSideEffects = ({
	phase,
	phases,
	logger,
	logData,
}: {
	phase: string;
	phases: BatchMigrationPagePhases;
	logger: Logger;
	logData: Record<string, unknown>;
}): DeferredSideEffects => {
	const inflight = new Set<Promise<void>>();
	const errors: unknown[] = [];

	return {
		defer: (run) => {
			const pending = run()
				.then(
					() => undefined,
					(error: unknown) => {
						errors.push(error);
					},
				)
				.finally(() => {
					inflight.delete(pending);
				});
			inflight.add(pending);
		},

		settle: async () => {
			while (inflight.size >= BATCH_MIGRATION_DEFERRED_INFLIGHT)
				await Promise.race(inflight);
		},

		drain: async () => {
			if (inflight.size > 0)
				await timePhase({
					phases,
					phase,
					run: () => Promise.all([...inflight]),
				});
			if (errors.length > 0)
				logger.error(`batch-migration: deferred ${phase} failed`, {
					data: { ...logData, failed: errors.length, error: String(errors[0]) },
				});
		},
	};
};
