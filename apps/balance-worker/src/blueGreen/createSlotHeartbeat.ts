import type {
	EdgeConfigLocation,
	EdgeConfigS3Client,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { ColdStartAck } from "../coldStart/types/coldStartAck.js";
import type { OwnedPartitionHealth } from "../health/ownedPartitionHealth.js";
import type { SlotGate } from "./createSlotGate.js";
import {
	type SlotHeartbeat,
	type SlotProbeResult,
	slotHeartbeatKeyOf,
} from "./types/slotHeartbeat.js";
import type { TaskIdentity } from "./types/taskIdentity.js";

const HEARTBEAT_INTERVAL_MS = 20_000;

type SlotHeartbeatContext = {
	s3Client: EdgeConfigS3Client;
	location: EdgeConfigLocation;
	gate: Pick<SlotGate, "describe">;
	readPartitions(): OwnedPartitionHealth[];
	/** True only for a partition this worker has claimed and admitted to its route directory. */
	isAdmitted(params: { partition: number }): boolean;
	/** False until the partition service is running and has been dealt its assignment. */
	readAssignmentSettled(): boolean;
	readStoreHealthy(): boolean;
	probes: { kafka(): Promise<void>; postgres(): Promise<void> };
	/** Present only where cold starts are honoured (staging); the heartbeat then always carries the latest ack. */
	readColdStart?(): ColdStartAck | null;
	logger?: Pick<AutumnLogger, "warn">;
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
};

type SlotHeartbeatConfig = {
	deployment: string;
	fleetId: string;
	endpoint: string;
	identity: TaskIdentity;
};

export function createSlotHeartbeat({
	ctx,
	config,
}: {
	ctx: SlotHeartbeatContext;
	config: SlotHeartbeatConfig;
}): { start(): Promise<void>; stop(): void; writeSoon(): void } {
	const instanceId = `${process.pid}-${crypto.randomUUID().split("-")[0]}`;
	const key = slotHeartbeatKeyOf({ fleetId: config.fleetId, instanceId });
	const startedAt = new Date().toISOString();
	let cancel: (() => void) | undefined;
	let writing: Promise<void> | null = null;

	async function probe(run: () => Promise<void>): Promise<SlotProbeResult> {
		const began = Date.now();
		try {
			await run();
			return { ok: true, latencyMs: Date.now() - began };
		} catch (cause) {
			return {
				ok: false,
				latencyMs: Date.now() - began,
				error: cause instanceof Error ? cause.message : String(cause),
			};
		}
	}

	async function build(): Promise<SlotHeartbeat> {
		const [kafka, postgres] = await Promise.all([
			probe(ctx.probes.kafka),
			probe(ctx.probes.postgres),
		]);
		const health = ctx.readPartitions();
		const gate = ctx.gate.describe();
		const storeHealthy = ctx.readStoreHealthy();
		// A heartbeat with no partitions would satisfy `prepared == total` vacuously.
		const assigned = ctx.readAssignmentSettled() && health.length > 0;
		return {
			serviceName: "balance-workers",
			fleetId: config.fleetId,
			deployment: config.deployment,
			endpoint: config.endpoint,
			instanceId,
			pid: process.pid,
			identity: config.identity,
			declaredActive: gate.active,
			gate: gate.reason,
			storeHealthy,
			// A task that cannot read the flip record is not one a swap should count on.
			ok: kafka.ok && postgres.ok && storeHealthy && assigned,
			checks: { kafka, postgres },
			partitions: {
				prepared: health.filter((p) => p.status === "prepared").length,
				ready: health.filter((p) => p.status === "ready").length,
				// Routable, not merely activating: the ownership topic may still name the predecessor.
				admitted: health.filter((p) =>
					ctx.isAdmitted({ partition: p.partition }),
				).length,
				total: health.length,
				byPartition: health.map((p) => ({
					partition: p.partition,
					status: p.status,
					lagRecords: p.lag === null ? null : Number(p.lag),
				})),
			},
			...(ctx.readColdStart ? { coldStart: ctx.readColdStart() } : {}),
			startedAt,
			writtenAt: new Date().toISOString(),
		};
	}

	async function write(): Promise<void> {
		try {
			const heartbeat = await build();
			await ctx.s3Client.send(
				new PutObjectCommand({
					Bucket: ctx.location.bucket,
					Key: key,
					Body: JSON.stringify(heartbeat, null, 2),
					ContentType: "application/json",
				}),
			);
		} catch (cause) {
			ctx.logger?.warn("Blue-green heartbeat not written", { error: cause });
		}
	}

	function writeWhenIdle(): void {
		if (writing) return;
		writing = write().finally(() => {
			writing = null;
		});
	}

	/** Writes now, or right after the write in flight, which may have read the state from before. */
	function writeSoon(): void {
		if (!cancel) return;
		if (writing) void writing.then(writeWhenIdle);
		else writeWhenIdle();
	}

	async function start(): Promise<void> {
		if (cancel) return;
		cancel = (ctx.schedule ?? scheduleWrites)({
			intervalMs: HEARTBEAT_INTERVAL_MS,
			run: writeWhenIdle,
		});
		writeWhenIdle();
		await writing;
	}

	function stop(): void {
		cancel?.();
		cancel = undefined;
	}

	return { start, stop, writeSoon };
}

function scheduleWrites({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref();
	return () => clearInterval(timer);
}
