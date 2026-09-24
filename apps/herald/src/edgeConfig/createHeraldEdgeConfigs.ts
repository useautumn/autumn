import {
	createEdgeConfigRegistry,
	createEdgeConfigStore,
	type EdgeConfigLocation,
	type EdgeConfigLogger,
	type EdgeConfigStore,
	type MiscRedisConfig,
	miscRedisEdgeConfig,
} from "@autumn/edge-config";

/** The edge configs herald polls; one registry drives them all. */
export type HeraldEdgeConfigs = {
	miscRedis: EdgeConfigStore<MiscRedisConfig>;
	start(): Promise<void>;
	stop(): void;
};

export const createHeraldEdgeConfigs = ({
	ctx,
	config,
}: {
	ctx: { logger?: EdgeConfigLogger };
	config: { location: EdgeConfigLocation };
}): HeraldEdgeConfigs => {
	const edgeConfigContext = {
		location: () => config.location,
		logger: ctx.logger,
	};
	const registry = createEdgeConfigRegistry({ ctx: edgeConfigContext });
	const miscRedis = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: miscRedisEdgeConfig.key,
		schema: miscRedisEdgeConfig.schema,
		defaultValue: miscRedisEdgeConfig.defaultValue,
	});
	registry.register({ store: miscRedis });

	return {
		miscRedis,
		start: () => registry.start({ logger: ctx.logger }),
		stop: registry.stop,
	};
};
