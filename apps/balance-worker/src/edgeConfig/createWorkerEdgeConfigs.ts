import {
	createEdgeConfigRegistry,
	createEdgeConfigStore,
	type DbControlEdgeConfig,
	dbControlEdgeConfig,
	type EdgeConfigLocation,
	type EdgeConfigLogger,
	type EdgeConfigStore,
} from "@autumn/edge-config";

/** The edge configs a worker polls; one registry drives them all. */
export type WorkerEdgeConfigs = {
	dbControl: EdgeConfigStore<DbControlEdgeConfig>;
	start(): Promise<void>;
	stop(): void;
};

export const createWorkerEdgeConfigs = ({
	ctx,
	config,
}: {
	ctx: { logger?: EdgeConfigLogger };
	config: { location: EdgeConfigLocation };
}): WorkerEdgeConfigs => {
	const edgeConfigContext = {
		location: () => config.location,
		logger: ctx.logger,
	};
	const registry = createEdgeConfigRegistry({ ctx: edgeConfigContext });
	const dbControl = createEdgeConfigStore({
		ctx: edgeConfigContext,
		s3Key: dbControlEdgeConfig.key,
		schema: dbControlEdgeConfig.schema,
		defaultValue: dbControlEdgeConfig.defaultValue,
	});
	registry.register({ store: dbControl });

	return {
		dbControl,
		start: () => registry.start({ logger: ctx.logger }),
		stop: registry.stop,
	};
};
