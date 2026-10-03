import {
	createBunS3EdgeConfigClient,
	createEdgeConfigRegistry,
	createEdgeConfigStore,
	type DbControlEdgeConfig,
	dbControlEdgeConfig,
	type EdgeConfigLocation,
	type EdgeConfigLogger,
	type EdgeConfigS3Client,
	type EdgeConfigStore,
} from "@autumn/edge-config";
import {
	type ActiveSlotEdgeConfig,
	activeSlotEdgeConfig,
} from "./activeSlotEdgeConfig.js";
import {
	type SubjectSnapshotsEdgeConfig,
	subjectSnapshotsEdgeConfig,
} from "./subjectSnapshotsEdgeConfig.js";

const ACTIVE_SLOT_POLL_INTERVAL_MS = 2_000;

/** The edge configs a worker polls; one registry drives them all. */
export type WorkerEdgeConfigs = {
	dbControl: EdgeConfigStore<DbControlEdgeConfig>;
	/** Polled on its own 2s timer: the dashboard writes the record without the registry's timestamp. */
	activeSlot: EdgeConfigStore<ActiveSlotEdgeConfig>;
	subjectSnapshots: EdgeConfigStore<SubjectSnapshotsEdgeConfig>;
	/** The same bucket and client the stores read, for objects the worker writes itself. */
	adminBucket: { s3Client: EdgeConfigS3Client; location: EdgeConfigLocation };
	start(): Promise<void>;
	stop(): void;
};

export const createWorkerEdgeConfigs = ({
	ctx,
	config,
}: {
	ctx: { logger?: EdgeConfigLogger; s3Client?: EdgeConfigS3Client };
	config: { location: EdgeConfigLocation };
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
	const subjectSnapshots = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: subjectSnapshotsEdgeConfig.key,
		schema: subjectSnapshotsEdgeConfig.schema,
		defaultValue: subjectSnapshotsEdgeConfig.defaultValue,
		// A read error or an object naming a mode without a read path must not flip a writing fleet back to off.
		retainOnError: true,
	});
	registry.register({ store: subjectSnapshots });
	const activeSlot = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: activeSlotEdgeConfig.key,
		schema: activeSlotEdgeConfig.schema,
		defaultValue: activeSlotEdgeConfig.defaultValue,
		pollIntervalMs: ACTIVE_SLOT_POLL_INTERVAL_MS,
		// The default names no service and would open the gate; a read error must keep the last record instead.
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
		activeSlot,
		subjectSnapshots,
		adminBucket: { s3Client, location: config.location },
		start,
		stop,
	};
};
