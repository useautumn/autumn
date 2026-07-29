import {
	ORG_ALLOWLIST_DEFAULT_CONFIG,
	type OrgAllowlistEdgeConfig,
} from "./orgAllowlistEdgeConfigTypes";

export type StripeSyncConfig = OrgAllowlistEdgeConfig;

export const STRIPE_SYNC_DEFAULT_CONFIG: StripeSyncConfig = {
	...ORG_ALLOWLIST_DEFAULT_CONFIG,
};

export const STRIPE_SYNC_QUERY_KEY = [
	"admin-edge-config",
	"stripe-sync",
] as const;
