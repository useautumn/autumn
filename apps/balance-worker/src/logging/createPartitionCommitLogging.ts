import type { AutumnLogger } from "@autumn/logging";
import type { CommittedOutcomeAppender } from "../processor/writer/types/partitionWriter.js";
import { MutationBatchNotCommittedError } from "../processor/writer/writerErrors.js";
import type { PartitionRuntimeDependencies } from "../runtime/types/partitionRuntime.js";
import type { DurableMutationApplyResult } from "../state/types/durableMutation.js";
import type { StateStore } from "../state/types/stateStore.js";
import type { CommitSummaries } from "./commitSummaries.js";

export function createPartitionCommitLogging({
	ctx,
	config,
}: {
	ctx: {
		appender: CommittedOutcomeAppender;
		stateStore: PartitionRuntimeDependencies["stateStore"];
		logger?: Partial<Pick<AutumnLogger, "error">>;
		/** Where each batch's timings are summed for the window's summary line. */
		summaries?: CommitSummaries;
		monotonicNow?: () => number;
	};
	config: { deployment: string; endpoint: string };
}): {
	appender: CommittedOutcomeAppender;
	stateStore: PartitionRuntimeDependencies["stateStore"];
} {
	const { logger, summaries } = ctx;
	if (!logger && !summaries)
		return { appender: ctx.appender, stateStore: ctx.stateStore };
	const now = ctx.monotonicNow ?? (() => performance.now());

	function elapsedMs(startedAt: number): number {
		return now() - startedAt;
	}

	function summarize(record: (summaries: CommitSummaries) => void): void {
		if (!summaries) return;
		try {
			record(summaries);
		} catch {
			// Telemetry cannot turn a durable commit into a failed request.
		}
	}

	async function appendCommitted(
		params: Parameters<CommittedOutcomeAppender["appendCommitted"]>[0],
	): Promise<{ baseOffset: bigint }> {
		const startedAt = now();
		const batch = {
			partition: params.partition,
			records: params.outcomes.length,
			waits: params.waits,
		};
		let result: { baseOffset: bigint };
		try {
			result = await ctx.appender.appendCommitted(params);
		} catch (cause) {
			summarize((window) =>
				window.committed({
					...batch,
					durationMs: elapsedMs(startedAt),
					result:
						cause instanceof MutationBatchNotCommittedError
							? "not_committed"
							: "unknown",
				}),
			);
			throw cause;
		}
		summarize((window) =>
			window.committed({
				...batch,
				durationMs: elapsedMs(startedAt),
				result: "committed",
			}),
		);
		return result;
	}

	async function applyDurableMutations(
		params: Parameters<StateStore["applyDurableMutations"]>[0],
	): Promise<DurableMutationApplyResult[]> {
		const position = params.records[0]?.position;
		if (!position) return await ctx.stateStore.applyDurableMutations(params);
		const metadata = {
			topic: position.topic,
			partition: position.partition,
			baseOffset: position.offset,
		};
		const startedAt = now();
		let result: DurableMutationApplyResult[];
		try {
			result = await ctx.stateStore.applyDurableMutations(params);
		} catch (cause) {
			summarize((window) =>
				window.applied({
					partition: position.partition,
					durationMs: elapsedMs(startedAt),
					failed: true,
				}),
			);
			throw cause;
		}
		summarize((window) =>
			window.applied({
				partition: position.partition,
				durationMs: elapsedMs(startedAt),
				failed: false,
			}),
		);
		reportUnreachableVerdicts({ metadata, results: result });
		return result;
	}

	/** The caller was answered when Kafka took the batch, so a store verdict arriving
	 *  afterwards has nobody to tell. A refused row used to reach an operator as that
	 *  caller's failed request; now this is the only place it is visible, so it is
	 *  logged at error rather than with the per-batch telemetry. */
	function reportUnreachableVerdicts({
		metadata,
		results,
	}: {
		metadata: { topic: string; partition: number; baseOffset: bigint };
		results: DurableMutationApplyResult[];
	}): void {
		try {
			const unreachable = results.filter(function isUnreachable(entry) {
				return entry.kind === "rejected" || entry.kind === "failed";
			});
			if (unreachable.length === 0) return;
			logger?.error?.(
				{
					event: "balance_worker.commit_verdict_unreachable",
					data: {
						topic: metadata.topic,
						partition: metadata.partition,
						baseOffset: metadata.baseOffset.toString(),
						workerEndpoint: config.endpoint,
						count: unreachable.length,
						verdicts: unreachable.map(function describe(entry) {
							return {
								kind: entry.kind,
								mutationId: "mutation" in entry ? entry.mutation.id : null,
								reason:
									"cause" in entry && entry.cause instanceof Error
										? entry.cause.message
										: null,
							};
						}),
					},
				},
				"Balance worker store refused a record its caller was already told had landed",
			);
		} catch {
			// Telemetry cannot turn a durable commit into a failed request.
		}
	}

	return {
		appender: { ...ctx.appender, appendCommitted },
		stateStore: {
			baseline: ctx.stateStore.baseline,
			readCommandNextOffset: ctx.stateStore.readCommandNextOffset.bind(
				ctx.stateStore,
			),
			advanceCommandNextOffset: ctx.stateStore.advanceCommandNextOffset.bind(
				ctx.stateStore,
			),
			readState: ctx.stateStore.readState.bind(ctx.stateStore),
			readOwnState: ctx.stateStore.readOwnState.bind(ctx.stateStore),
			readReceipt: ctx.stateStore.readReceipt.bind(ctx.stateStore),
			readNextOffset: ctx.stateStore.readNextOffset.bind(ctx.stateStore),
			...(ctx.stateStore.claimPartition
				? { claimPartition: ctx.stateStore.claimPartition.bind(ctx.stateStore) }
				: {}),
			applyDurableMutations,
		},
	};
}
