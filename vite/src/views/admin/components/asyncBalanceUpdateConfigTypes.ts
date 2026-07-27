import {
	ORG_ALLOWLIST_DEFAULT_CONFIG,
	type OrgAllowlistEdgeConfig,
} from "./orgAllowlistEdgeConfigTypes";

export type AsyncBalanceUpdateConfig = OrgAllowlistEdgeConfig;

export const ASYNC_BALANCE_UPDATE_DEFAULT_CONFIG: AsyncBalanceUpdateConfig = {
	...ORG_ALLOWLIST_DEFAULT_CONFIG,
};

export const ASYNC_BALANCE_UPDATE_QUERY_KEY = [
	"admin-edge-config",
	"async-balance-update",
] as const;
