import { runs, tasks } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchMigrationChunkResult } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import type { SendLatencyHistogram } from "@/internal/migrations/v2/batchOperations/queuedLane/measureApplyBillingPlanSends.js";
import type {
	QueuedLane,
	QueuedLaneChunkResult,
} from "@/internal/migrations/v2/batchOperations/queuedLane/types/queuedLane.js";
import type { BatchMigrationExecutionPlan } from "@/internal/migrations/v2/batchOperations/types/index.js";
import {
	buildRunBatchMigrationChunkPayload,
	type RunBatchMigrationChunkPayload,
	RunBatchMigrationChunkPayloadSchema,
} from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";
import "@/trigger/configureTrigger.js";
import { runBatchMigrationChunkPayload } from "@/trigger/migrations/runBatchMigrationChunkTask/runBatchMigrationChunkPayload.js";
import type { runBatchMigrationChunkTask } from "@/trigger/migrations/runBatchMigrationChunkTask/runBatchMigrationChunkTask.js";
import { percentileOf } from "./trackLoad.js";

const POLL_INTERVAL_MS = 1_000;

type ChunkOutput =
	| (BatchMigrationChunkResult & { sendLatencyMs: SendLatencyHistogram })
	| QueuedLaneChunkResult;

export type ChunkRunner = (params: {
	payload: RunBatchMigrationChunkPayload;
}) => Promise<{ output: ChunkOutput; runId: string | null }>;

export const triggerChunkRunner =
	({ version }: { version?: string }): ChunkRunner =>
	async ({ payload }) => {
		const handle = await tasks.trigger<typeof runBatchMigrationChunkTask>(
			"run-batch-migration-chunk",
			payload,
			version ? { version } : undefined,
		);
		const run = await runs.poll(handle, { pollIntervalMs: POLL_INTERVAL_MS });
		const output: ChunkOutput | undefined = run.output;
		if (run.status !== "COMPLETED" || !output)
			throw new Error(`Chunk run ${handle.id} ended ${run.status}`);
		return { output, runId: handle.id };
	};

export const inlineChunkRunner =
	({ ctx }: { ctx: AutumnContext }): ChunkRunner =>
	async ({ payload }) => ({
		output: await runBatchMigrationChunkPayload({
			ctx,
			payload: RunBatchMigrationChunkPayloadSchema.parse(
				JSON.parse(JSON.stringify(payload)),
			),
		}),
		runId: null,
	});

const latenciesOfHistogram = ({
	histogram,
}: {
	histogram: Record<string, number>;
}): number[] =>
	Object.entries(histogram).flatMap(([ms, count]) =>
		Array.from({ length: count }, () => Number(ms)),
	);

export const runChunks = async ({
	ctx,
	migrationRunId,
	migration,
	plan,
	queuedLane,
	runChunk,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	migration: RunBatchMigrationChunkPayload["migration"];
	plan: BatchMigrationExecutionPlan;
	queuedLane?: QueuedLane;
	runChunk: ChunkRunner;
}) => {
	const outputs: ChunkOutput[] = [];
	const runIds: string[] = [];
	let cursor: string | undefined;
	for (let chunkIndex = 0; ; chunkIndex++) {
		const { output, runId } = await runChunk({
			payload: {
				...buildRunBatchMigrationChunkPayload({
					ctx,
					migrationRunId,
					migration,
					plan,
					chunkIndex,
					cursor,
				}),
				queuedLane,
			},
		});
		if (runId) runIds.push(runId);
		outputs.push(output);
		cursor = output.cursor ?? undefined;
		if (output.completion !== "slice_complete") break;
	}

	const phases: Record<string, number> = {};
	const sendLatencies: number[] = [];
	let produced = 0;
	let firstProduceAt = 0;
	for (const output of outputs) {
		for (const [phase, ms] of Object.entries(output.summary.phases))
			phases[phase] = (phases[phase] ?? 0) + ms;
		if ("sendLatencyMs" in output)
			sendLatencies.push(
				...latenciesOfHistogram({ histogram: output.sendLatencyMs }),
			);
		if ("lane" in output) {
			produced += output.produced;
			firstProduceAt ||= output.firstProduceAt;
		}
	}
	return {
		chunks: outputs.length,
		runIds,
		chunksEndedAt: Date.now(),
		pages: outputs.reduce((total, output) => total + output.summary.pages, 0),
		processed: outputs.reduce((total, output) => total + output.processed, 0),
		produced,
		firstProduceAt,
		phases,
		sends: {
			count: sendLatencies.length,
			p50: percentileOf({ values: sendLatencies, percentile: 50 }),
			p99: percentileOf({ values: sendLatencies, percentile: 99 }),
			max: percentileOf({ values: sendLatencies, percentile: 100 }),
		},
	};
};
