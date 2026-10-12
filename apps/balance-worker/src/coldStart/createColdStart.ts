import type {
	BalanceWorkerColdStartEdgeConfig,
	ColdStartScope,
	EdgeConfigStore,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { Partitions } from "../partitions/types/partitions.js";
import type { ResidentDrop } from "../processor/writer/subjectMap/types/subjectMap.js";
import type { ColdStartAck } from "./types/coldStartAck.js";

type ColdStartContext = {
	requests: Pick<
		EdgeConfigStore<BalanceWorkerColdStartEdgeConfig>,
		"get" | "subscribe"
	>;
	partitions: Pick<Partitions, "partitions" | "findOwnedRuntime">;
	logger: Pick<AutumnLogger, "info" | "warn">;
	/** Called once an ack is ready, so the heartbeat carries it without waiting for its next tick. */
	onAcked(): void;
};

export type ColdStart = {
	start(): void;
	stop(): void;
	readAck(): ColdStartAck | null;
};

/** Each new request empties its scope of every partition this worker serves, one request at a time; a worker that boots after one is already cold. */
export function createColdStart({ ctx }: { ctx: ColdStartContext }): ColdStart {
	let ack: ColdStartAck | null = null;
	let seen: string | null = null;
	let handling: Promise<void> = Promise.resolve();
	let unsubscribe: (() => void) | null = null;

	function receive({
		requestId,
		...coldStart
	}: BalanceWorkerColdStartEdgeConfig): void {
		if (requestId === null || requestId === seen) return;
		seen = requestId;
		handling = handling.then(() => handle({ requestId, coldStart }));
	}

	async function evictPartition({
		partition,
		coldStart,
	}: {
		partition: number;
		coldStart: ColdStartScope;
	}): Promise<ResidentDrop> {
		const runtime = ctx.partitions.findOwnedRuntime({ partition });
		if (!runtime) return { evicted: 0, kept: 0, resident: 0 };
		return runtime.process((processor) =>
			processor.evictResident({ coldStart }),
		);
	}

	async function handle({
		requestId,
		coldStart,
	}: {
		requestId: string;
		coldStart: ColdStartScope;
	}): Promise<void> {
		const began = performance.now();
		const partitions = ctx.partitions
			.partitions()
			.map(({ partition }) => partition);
		const results = await Promise.allSettled(
			partitions.map((partition) => evictPartition({ partition, coldStart })),
		);
		let evictedSubjects = 0;
		let keptSubjects = 0;
		let residentSubjects = 0;
		const failedPartitions: number[] = [];
		for (const [index, result] of results.entries()) {
			if (result.status === "fulfilled") {
				evictedSubjects += result.value.evicted;
				keptSubjects += result.value.kept;
				residentSubjects += result.value.resident;
				continue;
			}
			failedPartitions.push(partitions[index] as number);
			ctx.logger.warn(`Cold start ${requestId}: partition eviction failed`, {
				partition: partitions[index],
				error: result.reason,
			});
		}
		ack = {
			requestId,
			completedAt: new Date().toISOString(),
			durationMs: Math.round(performance.now() - began),
			evictedSubjects,
			keptSubjects,
			residentSubjects,
			failedPartitions,
		};
		ctx.logger.info(
			`Cold start ${requestId}: evicted ${evictedSubjects} subjects from ${partitions.length} partitions in ${ack.durationMs} ms, ${keptSubjects} kept by scope, ${residentSubjects} still pinned`,
			{ coldStart: ack },
		);
		ctx.onAcked();
	}

	function start(): void {
		if (unsubscribe) return;
		unsubscribe = ctx.requests.subscribe((config) => receive(config));
		receive(ctx.requests.get());
	}

	function stop(): void {
		unsubscribe?.();
		unsubscribe = null;
	}

	return { start, stop, readAck: () => ack };
}
