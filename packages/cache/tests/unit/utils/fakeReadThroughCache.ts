import { createConsoleLogger } from "@autumn/logging";
import type { Redis } from "ioredis";
import type { MiscCacheTarget } from "../../../src/misc/types/miscCache.js";
import type { ReadThroughCacheContext } from "../../../src/misc/types/readThroughCacheContext.js";

export type FakeRedis = Redis & { store: Map<string, string>; calls: string[] };
type Reply = [Error | null, unknown];

/** An in-memory client that records every command; `exec` answers each in order, like ioredis. */
export const createFakeRedis = ({
	status,
}: {
	status: () => string;
}): FakeRedis => {
	const store = new Map<string, string>();
	const calls: string[] = [];
	const get = async (key: string) => {
		calls.push(`get:${key}`);
		return store.get(key) ?? null;
	};
	const set = async (
		key: string,
		value: string,
		...args: (string | number)[]
	) => {
		calls.push(`set:${key}:${args.join(":")}`);
		store.set(key, value);
		return "OK";
	};
	const del = async (key: string) => {
		calls.push(`del:${key}`);
		return store.delete(key) ? 1 : 0;
	};
	const pipeline = () => {
		const queued: (() => Promise<Reply>)[] = [];
		const chain = {
			get length() {
				return queued.length;
			},
			get(key: string) {
				queued.push(async () => [null, await get(key)]);
				return chain;
			},
			set(key: string, value: string, ...args: (string | number)[]) {
				queued.push(async () => [null, await set(key, value, ...args)]);
				return chain;
			},
			del(key: string) {
				queued.push(async () => [null, await del(key)]);
				return chain;
			},
			async exec() {
				const replies: Reply[] = [];
				for (const run of queued) replies.push(await run());
				return replies;
			},
		};
		return chain;
	};
	return {
		store,
		calls,
		get status() {
			return status();
		},
		get,
		set,
		del,
		pipeline,
	} as unknown as FakeRedis;
};

/** A read-through ctx over two fake targets: reads resolve to main, invalidations reach both. */
export const createFakeReadThroughCache = () => {
	let status = "ready";
	const main = createFakeRedis({ status: () => status });
	const backup = createFakeRedis({ status: () => status });
	const targets: MiscCacheTarget[] = [
		{ instanceName: "main", redis: main },
		{ instanceName: "backup", redis: backup },
	];
	const ctx: ReadThroughCacheContext = {
		miscCache: {
			resolve: () => main,
			forEachTarget: async ({ operation, onError }) =>
				Promise.all(
					targets.map(async (target) => {
						try {
							return {
								status: "fulfilled" as const,
								value: await operation(target),
							};
						} catch (error) {
							onError?.({ target, error });
							return { status: "rejected" as const, reason: error };
						}
					}),
				),
		},
		logger: createConsoleLogger({ level: "error" }),
	};
	const reset = () => {
		for (const redis of [main, backup]) {
			redis.store.clear();
			redis.calls.length = 0;
		}
		status = "ready";
	};
	const setStatus = (next: string) => {
		status = next;
	};
	return { ctx, main, backup, reset, setStatus };
};
