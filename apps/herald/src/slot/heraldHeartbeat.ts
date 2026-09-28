import {
	createHeartbeatWriter,
	type HeartbeatWriter,
	heartbeatKeyOf,
	instanceIdOf,
	runProbe,
	type SlotGate,
	type TaskIdentity,
} from "@autumn/blue-green";
import type {
	EdgeConfigLocation,
	EdgeConfigS3Client,
} from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import { HERALD_BLUE_GREEN_SERVICE_NAME } from "../edgeConfig/createHeraldEdgeConfigs.js";
import type { HeraldReadinessProbes } from "./heraldReadinessProbes.js";
import type { HeraldHeartbeat, JobHealth } from "./types/heraldHeartbeat.js";

type HeraldHeartbeatContext = {
	s3Client: EdgeConfigS3Client;
	location: EdgeConfigLocation;
	gate: Pick<SlotGate, "describe">;
	readJobs(): JobHealth[];
	readStoreHealthy(): boolean;
	probes: HeraldReadinessProbes;
	logger?: Pick<AutumnLogger, "warn">;
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
};

type HeraldHeartbeatConfig = {
	deployment: string;
	fleetId: string;
	identity: TaskIdentity;
};

/** Written in both slot states: before a flip the dashboard reads `ok` on the target; after it, `jobs.joined` on both. */
export function createHeraldHeartbeat({
	ctx,
	config,
}: {
	ctx: HeraldHeartbeatContext;
	config: HeraldHeartbeatConfig;
}): HeartbeatWriter {
	const instanceId = instanceIdOf();
	const startedAt = new Date().toISOString();

	async function build(): Promise<HeraldHeartbeat> {
		const [kafka, eventsDb, miscCache] = await Promise.all([
			runProbe(ctx.probes.kafka),
			runProbe(ctx.probes.eventsDb),
			runProbe(ctx.probes.miscCache),
		]);
		const gate = ctx.gate.describe();
		const storeHealthy = ctx.readStoreHealthy();
		const byJob = ctx.readJobs();
		return {
			serviceName: HERALD_BLUE_GREEN_SERVICE_NAME,
			fleetId: config.fleetId,
			deployment: config.deployment,
			instanceId,
			pid: process.pid,
			identity: config.identity,
			declaredActive: gate.active,
			gate: gate.reason,
			storeHealthy,
			// A task that cannot read the flip record is not one a swap should count on.
			ok: kafka.ok && eventsDb.ok && miscCache.ok && storeHealthy,
			checks: { kafka, eventsDb, miscCache },
			jobs: {
				total: byJob.length,
				joined: byJob.filter((job) => job.membership === "joined").length,
				byJob,
			},
			startedAt,
			writtenAt: new Date().toISOString(),
		};
	}

	return createHeartbeatWriter({
		ctx: {
			s3Client: ctx.s3Client,
			location: ctx.location,
			build,
			logger: ctx.logger,
			schedule: ctx.schedule,
		},
		config: {
			key: heartbeatKeyOf({
				serviceName: HERALD_BLUE_GREEN_SERVICE_NAME,
				fleetId: config.fleetId,
				instanceId,
			}),
		},
	});
}
