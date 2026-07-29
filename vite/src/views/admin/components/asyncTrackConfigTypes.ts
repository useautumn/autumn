import {
	ORG_ALLOWLIST_DEFAULT_CONFIG,
	type OrgAllowlistEdgeConfig,
} from "./orgAllowlistEdgeConfigTypes";

export type AsyncTrackConfig = OrgAllowlistEdgeConfig;

export const ASYNC_TRACK_DEFAULT_CONFIG: AsyncTrackConfig = {
	...ORG_ALLOWLIST_DEFAULT_CONFIG,
};

export const ASYNC_TRACK_QUERY_KEY = [
	"admin-edge-config",
	"async-track",
] as const;
