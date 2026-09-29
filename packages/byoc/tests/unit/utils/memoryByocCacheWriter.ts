import { isNewerCacheEntry } from "../../../src/cacheEntries/classifyCacheEntries.js";
import type { ByocCacheEntry } from "../../../src/cacheEntries/types/byocCacheEntry.js";
import type {
	ByocCacheWriteResult,
	ByocCacheWriter,
} from "../../../src/cacheWriters/types/byocCacheWriter.js";

type MemoryStore = Map<string, ByocCacheEntry>;

const storeKey = ({
	deploymentId,
	key,
}: {
	deploymentId: string;
	key: string;
}) => `${deploymentId}/${key}`;

const write = async ({
	ctx,
	deploymentId,
	key,
	entry,
}: {
	ctx: { store: MemoryStore };
	deploymentId: string;
	key: string;
	entry: ByocCacheEntry;
}): Promise<ByocCacheWriteResult> => {
	const slot = storeKey({ deploymentId, key });
	const stored = ctx.store.get(slot) ?? null;
	if (!isNewerCacheEntry({ incoming: entry, stored })) return "stale";
	ctx.store.set(slot, entry);
	return "written";
};

const read = ({
	ctx,
	deploymentId,
	key,
}: {
	ctx: { store: MemoryStore };
	deploymentId: string;
	key: string;
}): ByocCacheEntry | null =>
	ctx.store.get(storeKey({ deploymentId, key })) ?? null;

/** A KV held in memory: the writer contract with a read-back for assertions. */
export const createMemoryByocCacheWriter = (): ByocCacheWriter & {
	read(params: { deploymentId: string; key: string }): ByocCacheEntry | null;
} => {
	const ctx = { store: new Map() as MemoryStore };
	return {
		write: (params) => write({ ctx, ...params }),
		read: (params) => read({ ctx, ...params }),
	};
};
