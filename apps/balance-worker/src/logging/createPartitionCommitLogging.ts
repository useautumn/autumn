import type { AutumnLogger } from "@autumn/logging";
import type { CommittedOutcomeAppender } from "../processor/writer/types/partitionWriter.js";
import { MutationBatchNotCommittedError } from "../processor/writer/writerErrors.js";
import type { PartitionRuntimeDependencies } from "../runtime/types/partitionRuntime.js";
import type { DurableMutationApplyResult } from "../state/types/durableMutation.js";
import type { StateStore } from "../state/types/stateStore.js";

type CommitLog = {
	topic: string;
	partition: number;
	batchSize: number;
	baseOffset: bigint | null;
	startedAt: number;
	errorName?: string;
} & (
	| { phase: "kafka_commit"; result: "committed" | "not_committed" | "unknown" }
	| { phase: "sqlite_apply"; result: "applied" | "failed" }
);

export function createPartitionCommitLogging({
	ctx,
	config,
}: {
	ctx: {
		appender: CommittedOutcomeAppender;
		stateStore: PartitionRuntimeDependencies["stateStore"];
		logger?: Pick<AutumnLogger, "info" | "warn">;
		monotonicNow?: () => number;
	};
	config: { deployment: string; endpoint: string };
}): {
	appender: CommittedOutcomeAppender;
	stateStore: PartitionRuntimeDependencies["stateStore"];
} {
	const { logger } = ctx;
	if (!logger) return { appender: ctx.appender, stateStore: ctx.stateStore };
	const now = ctx.monotonicNow ?? (() => performance.now());

	function report({ startedAt, baseOffset, ...fields }: CommitLog): void {
		try {
			const event = {
				event: "balance_worker.commit",
				workerDeployment: config.deployment,
				workerEndpoint: config.endpoint,
				...fields,
				baseOffset: baseOffset?.toString() ?? null,
				durationMs: Math.round((now() - startedAt) * 100) / 100,
			};
			if (fields.result === "committed" || fields.result === "applied")
				logger?.info(event, "Balance worker commit phase completed");
			else logger?.warn(event, "Balance worker commit phase failed");
		} catch {
			// Telemetry cannot turn a durable commit into a failed request.
		}
	}

	async function appendCommitted(
		params: Parameters<CommittedOutcomeAppender["appendCommitted"]>[0],
	): Promise<{ baseOffset: bigint }> {
		const metadata = {
			topic: params.topic,
			partition: params.partition,
			batchSize: params.outcomes.length,
			startedAt: now(),
			phase: "kafka_commit" as const,
		};
		let result: { baseOffset: bigint };
		try {
			result = await ctx.appender.appendCommitted(params);
		} catch (cause) {
			report({
				...metadata,
				result:
					cause instanceof MutationBatchNotCommittedError
						? "not_committed"
						: "unknown",
				baseOffset: null,
				errorName: cause instanceof Error ? cause.name : "unknown_failure",
			});
			throw cause;
		}
		report({
			...metadata,
			result: "committed",
			baseOffset: result.baseOffset,
		});
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
			batchSize: params.records.length,
			baseOffset: position.offset,
			startedAt: now(),
			phase: "sqlite_apply" as const,
		};
		let result: DurableMutationApplyResult[];
		try {
			result = await ctx.stateStore.applyDurableMutations(params);
		} catch (cause) {
			report({
				...metadata,
				result: "failed",
				errorName: cause instanceof Error ? cause.name : "unknown_failure",
			});
			throw cause;
		}
		report({ ...metadata, result: "applied" });
		return result;
	}

	return {
		appender: { appendCommitted },
		stateStore: {
			readState: ctx.stateStore.readState.bind(ctx.stateStore),
			readOwnState: ctx.stateStore.readOwnState.bind(ctx.stateStore),
			readReceipt: ctx.stateStore.readReceipt.bind(ctx.stateStore),
			readNextOffset: ctx.stateStore.readNextOffset.bind(ctx.stateStore),
			applyDurableMutations,
		},
	};
}
