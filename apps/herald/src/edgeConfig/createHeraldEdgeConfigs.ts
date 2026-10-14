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
	type ShadowAtomConfig,
	shadowAtomConfig,
} from "@autumn/edge-config";

export const HERALD_BLUE_GREEN_SERVICE_NAME = "herald";
const ACTIVE_SLOT_POLL_INTERVAL_MS = 2_000;

export type HeraldEdgeConfigs = {
	miscRedis: EdgeConfigStore<MiscRedisConfig>;
	shadowAtom: EdgeConfigStore<ShadowAtomConfig>;
	activeSlot: EdgeConfigStore<ActiveSlotEdgeConfig>;
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
	const shadowAtom = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: shadowAtomConfig.key,
		schema: shadowAtomConfig.schema,
		defaultValue: shadowAtomConfig.defaultValue,
		retainOnError: true,
	});
	registry.register({ store: shadowAtom });
	const activeSlotDefinition = activeSlotEdgeConfigOf({
		serviceName: HERALD_BLUE_GREEN_SERVICE_NAME,
	});
	const activeSlot = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: activeSlotDefinition.key,
		schema: activeSlotDefinition.schema,
		defaultValue: activeSlotDefinition.defaultValue,
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
		miscRedis,
		shadowAtom,
		activeSlot,
		adminBucket: { s3Client, location: config.location },
		start,
		stop,
	};
};
