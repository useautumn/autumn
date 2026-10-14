export type SizingShard = {
	key: string;
	files: string[];
	maxWorkers?: number;
};

export const MAIN_SHARD = "main";
export const SOLO_SHARD = "solo";

export const shardKeyOf = (capabilities: readonly string[]) =>
	capabilities.length === 0 ? MAIN_SHARD : capabilities.join(",");
