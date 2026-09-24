import { getCacheEnv } from "@autumn/env/cache";
import {
	createHeraldEdgeConfigs,
	type HeraldEdgeConfigs,
} from "../edgeConfig/createHeraldEdgeConfigs.js";
import { getHeraldLogger } from "./getHeraldLogger.js";

let edgeConfigs: HeraldEdgeConfigs | undefined;

export function getHeraldEdgeConfigs(): HeraldEdgeConfigs {
	edgeConfigs ??= createHeraldEdgeConfigs({
		ctx: { logger: getHeraldLogger() },
		config: { location: getCacheEnv().CACHE_EDGE_CONFIG_LOCATION },
	});
	return edgeConfigs;
}
