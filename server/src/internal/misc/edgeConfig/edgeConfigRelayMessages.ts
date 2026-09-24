export const EDGE_CONFIG_SUBSCRIBE = "edge-config:subscribe";
export const EDGE_CONFIG_UPDATE = "edge-config:update";
export const EDGE_CONFIG_ERROR = "edge-config:error";

export type EdgeConfigSubscription = { key: string; pollIntervalMs?: number };

/** Fork → primary. */
export type EdgeConfigSubscribeMessage = {
	type: typeof EDGE_CONFIG_SUBSCRIBE;
	keys: EdgeConfigSubscription[];
};

/** Primary → fork. `raw` is the unparsed S3 body, null when missing or empty. */
export type EdgeConfigResultMessage =
	| { type: typeof EDGE_CONFIG_UPDATE; key: string; raw: string | null }
	| { type: typeof EDGE_CONFIG_ERROR; key: string; error: string };
