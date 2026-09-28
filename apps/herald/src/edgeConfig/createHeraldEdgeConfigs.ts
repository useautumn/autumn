import {
	type ActiveSlotEdgeConfig,
	activeSlotEdgeConfigOf,
} from "@autumn/blue-green";
import {
	createBunS3EdgeConfigClient,
	createEdgeConfigRegistry,
	createEdgeConfigStore,
	type EdgeConfigLocation,
	type EdgeConfigLogger,
	type EdgeConfigS3Client,
	type EdgeConfigStore,
	type MiscRedisConfig,
	miscRedisEdgeConfig,
} from "@autumn/edge-config";

export const HERALD_BLUE_GREEN_SERVICE_NAME = "herald";
const ACTIVE_SLOT_POLL_INTERVAL_MS = 2_000;

/** The edge configs herald polls; one registry drives them all. */
export type HeraldEdgeConfigs = {
	miscRedis: EdgeConfigStore<MiscRedisConfig>;
	/** Polled on its own 2s timer: the dashboard writes the record without the registry's timestamp. */
	activeSlot: EdgeConfigStore<ActiveSlotEdgeConfig>;
	/** The same bucket and client the stores read, for the heartbeat herald writes itself. */
	adminBucket: { s3Client: EdgeConfigS3Client; location: EdgeConfigLocation };
	start(): Promise<void>;
	stop(): void;
};

export const createHeraldEdgeConfigs = ({
	ctx,
	config,
}: {
	ctx: { logger?: EdgeConfigLogger; s3Client?: EdgeConfigS3Client };
	config: { location: EdgeConfigLocation };
}): HeraldEdgeConfigs => {
	const s3Client =
		ctx.s3Client ??
		createBunS3EdgeConfigClient({ region: config.location.region });
	const edgeConfigContext = {
		location: () => config.location,
		logger: ctx.logger,
		s3Client,
	};
	const registry = createEdgeConfigRegistry({ ctx: edgeConfigContext });
	const miscRedis = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: miscRedisEdgeConfig.key,
		schema: miscRedisEdgeConfig.schema,
		defaultValue: miscRedisEdgeConfig.defaultValue,
	});
	registry.register({ store: miscRedis });
	const activeSlotDefinition = activeSlotEdgeConfigOf({
		serviceName: HERALD_BLUE_GREEN_SERVICE_NAME,
	});
	const activeSlot = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: activeSlotDefinition.key,
		schema: activeSlotDefinition.schema,
		defaultValue: activeSlotDefinition.defaultValue,
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
		miscRedis,
		activeSlot,
		adminBucket: { s3Client, location: config.location },
		start,
		stop,
	};
};
