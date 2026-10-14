import {
	type BalanceWorkerColdStartEdgeConfig,
	type BalanceWorkerThreadsEdgeConfig,
	balanceWorkerColdStartEdgeConfig,
	balanceWorkerThreadsEdgeConfig,
	createBunS3EdgeConfigClient,
	createEdgeConfigRegistry,
	createEdgeConfigStore,
	type DbControlEdgeConfig,
	dbControlEdgeConfig,
	type EdgeConfigLocation,
	type EdgeConfigLogger,
	type EdgeConfigS3Client,
	type EdgeConfigStore,
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "@autumn/edge-config";
import {
	type ActiveSlotEdgeConfig,
	activeSlotEdgeConfig,
} from "./activeSlotEdgeConfig.js";

const ACTIVE_SLOT_POLL_INTERVAL_MS = 2_000;

export type WorkerEdgeConfigs = {
	dbControl: EdgeConfigStore<DbControlEdgeConfig>;
	balanceWorkerThreads: EdgeConfigStore<BalanceWorkerThreadsEdgeConfig>;
	activeSlot: EdgeConfigStore<ActiveSlotEdgeConfig>;
	subjectSnapshotsConfig: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	coldStart: EdgeConfigStore<BalanceWorkerColdStartEdgeConfig> | null;
	adminBucket: { s3Client: EdgeConfigS3Client; location: EdgeConfigLocation };
	start(): Promise<void>;
	stop(): void;
};

export const createWorkerEdgeConfigs = ({
	ctx,
	config,
}: {
	ctx: { logger?: EdgeConfigLogger; s3Client?: EdgeConfigS3Client };
	config: { location: EdgeConfigLocation; coldStart: boolean };
}): WorkerEdgeConfigs => {
	const s3Client =
		ctx.s3Client ??
		createBunS3EdgeConfigClient({ region: config.location.region });
	const edgeConfigContext = {
		location: () => config.location,
		logger: ctx.logger,
		s3Client,
	};
	const registry = createEdgeConfigRegistry({ ctx: edgeConfigContext });
	const dbControl = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: dbControlEdgeConfig.key,
		schema: dbControlEdgeConfig.schema,
		defaultValue: dbControlEdgeConfig.defaultValue,
	});
	registry.register({ store: dbControl });
	const balanceWorkerThreads = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: balanceWorkerThreadsEdgeConfig.key,
		schema: balanceWorkerThreadsEdgeConfig.schema,
		defaultValue: balanceWorkerThreadsEdgeConfig.defaultValue,
	});
	registry.register({ store: balanceWorkerThreads });
	const subjectSnapshotsConfig = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: subjectSnapshotsEdgeConfig.key,
		schema: subjectSnapshotsEdgeConfig.schema,
		defaultValue: subjectSnapshotsEdgeConfig.defaultValue,
		retainOnError: true,
	});
	registry.register({ store: subjectSnapshotsConfig });
	const coldStart = config.coldStart
		? createEdgeConfigStore({
				ctx: edgeConfigContext,
				s3Key: balanceWorkerColdStartEdgeConfig.key,
				schema: balanceWorkerColdStartEdgeConfig.schema,
				defaultValue: balanceWorkerColdStartEdgeConfig.defaultValue,
				retainOnError: true,
			})
		: null;
	if (coldStart) registry.register({ store: coldStart });
	const activeSlot = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: activeSlotEdgeConfig.key,
		schema: activeSlotEdgeConfig.schema,
		defaultValue: activeSlotEdgeConfig.defaultValue,
		pollIntervalMs: ACTIVE_SLOT_POLL_INTERVAL_MS,
		retainOnError: true,
	});

	async function start(): Promise<void> {
		await registry.start({ logger: ctx.logger });
		await activeSlot.startPolling({ logger: ctx.logger });
	}

	function stop(): void {
		activeSlot.stopPolling();
		registry.stop();
	}

	return {
		dbControl,
		balanceWorkerThreads,
		activeSlot,
		subjectSnapshotsConfig,
		coldStart,
		adminBucket: { s3Client, location: config.location },
		start,
		stop,
	};
};
