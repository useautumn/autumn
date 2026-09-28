import {
	type DbControlEdgeConfig,
	dbControlEdgeConfig,
} from "@autumn/edge-config";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";

/** Live knobs on how our processes drive Postgres; the balance worker polls the same object. */
const store = createEdgeConfigStore<DbControlEdgeConfig>({
	s3Key: dbControlEdgeConfig.key,
	schema: dbControlEdgeConfig.schema,
	defaultValue: dbControlEdgeConfig.defaultValue,
});

registerEdgeConfig({ store });

export const getRuntimeDbControlConfig = (): DbControlEdgeConfig => store.get();
export const getRuntimeDbControlStatus = () => store.getStatus();
export const getDbControlConfigFromSource = () => store.readFromSource();
export const updateDbControlConfig = ({
	config,
}: {
	config: DbControlEdgeConfig;
}) => store.writeToSource({ config });
