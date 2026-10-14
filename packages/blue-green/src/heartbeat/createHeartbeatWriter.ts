import type {
	EdgeConfigLocation,
	EdgeConfigS3Client,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { SlotProbeResult } from "../types/slotProbe.js";

export const HEARTBEAT_INTERVAL_MS = 20_000;

export function heartbeatKeyOf({
	serviceName,
	fleetId,
	instanceId,
}: {
	serviceName: string;
	fleetId: string;
	instanceId: string;
}): string {
	return `admin/blue-green-heartbeats/${serviceName}/${fleetId}/${instanceId}.json`;
}

export function instanceIdOf(): string {
	return `${process.pid}-${crypto.randomUUID().split("-")[0]}`;
}

export async function runProbe(
	run: () => Promise<void>,
): Promise<SlotProbeResult> {
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

type HeartbeatWriterContext = {
	s3Client: EdgeConfigS3Client;
	location: EdgeConfigLocation;
	build(): Promise<unknown>;
	logger?: Pick<AutumnLogger, "warn">;
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
};

export type HeartbeatWriter = { start(): Promise<void>; stop(): void };

export function createHeartbeatWriter({
	ctx,
	config,
}: {
	ctx: HeartbeatWriterContext;
	config: { key: string; intervalMs?: number };
}): HeartbeatWriter {
	let cancel: (() => void) | undefined;
	let writing: Promise<void> | null = null;

	async function write(): Promise<void> {
		try {
			const body = await ctx.build();
			await ctx.s3Client.send(
				new PutObjectCommand({
					Bucket: ctx.location.bucket,
					Key: config.key,
					Body: JSON.stringify(body, null, 2),
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

	async function start(): Promise<void> {
		if (cancel) return;
		cancel = (ctx.schedule ?? scheduleWrites)({
			intervalMs: config.intervalMs ?? HEARTBEAT_INTERVAL_MS,
			run: writeWhenIdle,
		});
		writeWhenIdle();
		await writing;
	}

	function stop(): void {
		cancel?.();
		cancel = undefined;
	}

	return { start, stop };
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
