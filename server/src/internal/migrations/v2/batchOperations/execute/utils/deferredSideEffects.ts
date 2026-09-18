import { withTimeout } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	BATCH_MIGRATION_DEFERRED_INFLIGHT,
	BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS,
} from "./batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "./pagePhaseTimings.js";

export type DeferredOperation = {
	/** Names the op in stall and failure logs, e.g. "page 8". */
	label: string;
	run: () => Promise<unknown>;
	/** Runs after a failure or timeout, before the op is released; gets its own
	 * `timeoutMs` so the caller can undo a checkpoint without re-hanging. */
	onFailure?: (error: unknown) => Promise<void> | void;
};

export type DeferredFailure = {
	label: string;
	error: unknown;
	timedOut: boolean;
};

export type DeferredDrainResult = {
	failures: DeferredFailure[];
};

export type DeferredPending = {
	inflight: number;
	oldestMs: number | null;
	labels: string[];
};

export type DeferredSideEffects = {
	/** Start `run` off the critical path. Never throws. */
	defer: (operation: DeferredOperation) => void;
	/** Block until in-flight work is under the cap. Never throws. */
	settle: () => Promise<void>;
	/** Await everything started so far and report failures. Never throws. */
	drain: () => Promise<DeferredDrainResult>;
	/** What is still running — for stall diagnostics. */
	pending: () => DeferredPending;
};

/** Runs a page's post-commit side effects off the critical path. Every op is
 * bounded by `timeoutMs` with its rejection captured, so settle/drain always return. */
export const createDeferredSideEffects = ({
	phase,
	phases,
	logger,
	logData,
	timeoutMs = BATCH_MIGRATION_DEFERRED_OPERATION_TIMEOUT_MS,
}: {
	phase: string;
	phases: BatchMigrationPagePhases;
	logger: Logger;
	logData: Record<string, unknown>;
	timeoutMs?: number;
}): DeferredSideEffects => {
	const inflight = new Map<
		Promise<void>,
		{ label: string; startedAt: number }
	>();
	const failures: DeferredFailure[] = [];

	const recordFailure = async ({
		operation,
		error,
		timedOut,
	}: {
		operation: DeferredOperation;
		error: unknown;
		timedOut: boolean;
	}) => {
		failures.push({ label: operation.label, error, timedOut });
		logger.error(
			`batch-migration: deferred ${phase} ${timedOut ? "timed out" : "failed"}`,
			{
				data: {
					...logData,
					label: operation.label,
					timeoutMs,
					error: error instanceof Error ? error.message : String(error),
				},
			},
		);
		if (!operation.onFailure) return;
		try {
			await withTimeout({
				timeoutMs,
				fn: async () => operation.onFailure?.(error),
				timeoutMessage: `deferred ${phase} onFailure exceeded ${timeoutMs}ms`,
			});
		} catch (handlerError) {
			logger.error(
				`batch-migration: deferred ${phase} failure handler failed`,
				{
					data: {
						...logData,
						label: operation.label,
						error:
							handlerError instanceof Error
								? handlerError.message
								: String(handlerError),
					},
				},
			);
		}
	};

	return {
		defer: (operation) => {
			const startedAt = Date.now();
			const original = Promise.resolve().then(operation.run);
			// A late rejection from an abandoned op must never go unhandled.
			original.catch(() => undefined);

			let timedOut = false;
			const pending: Promise<void> = withTimeout({
				timeoutMs,
				fn: () => original,
				onTimeout: () => {
					timedOut = true;
				},
				timeoutMessage: `deferred ${phase} (${operation.label}) exceeded ${timeoutMs}ms`,
			})
				.then(
					() => undefined,
					(error: unknown) => recordFailure({ operation, error, timedOut }),
				)
				.finally(() => {
					inflight.delete(pending);
				});
			inflight.set(pending, { label: operation.label, startedAt });
		},

		settle: async () => {
			while (inflight.size >= BATCH_MIGRATION_DEFERRED_INFLIGHT)
				await Promise.race(inflight.keys());
		},

		drain: async () => {
			if (inflight.size > 0)
				await timePhase({
					phases,
					phase,
					run: () => Promise.all([...inflight.keys()]),
				});
			return { failures: [...failures] };
		},

		pending: () => {
			const now = Date.now();
			const entries = [...inflight.values()];
			return {
				inflight: entries.length,
				oldestMs:
					entries.length > 0
						? Math.max(...entries.map((entry) => now - entry.startedAt))
						: null,
				labels: entries.map((entry) => entry.label),
			};
		},
	};
};
