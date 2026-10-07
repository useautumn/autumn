/** A pooled shard as twd and the swarm child both partition it: "main", "solo", or its capabilities joined. */
export type SizingShard = {
	key: string;
	files: string[];
	/** Capability cap on workers (svix etc.); undefined is uncapped. */
	maxWorkers?: number;
};

export const MAIN_SHARD = "main";
/** Normal files that must run alone on a worker while the main shard packs. */
export const SOLO_SHARD = "solo";

export const shardKeyOf = (capabilities: readonly string[]) =>
	capabilities.length === 0 ? MAIN_SHARD : capabilities.join(",");
