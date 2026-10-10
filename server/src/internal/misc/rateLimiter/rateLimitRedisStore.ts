import { RedisStore } from "@hono-rate-limiter/redis";
import type { Env } from "hono";
import { getMiscRedis } from "@/external/redis/initRedis.js";

// The store reloads its script after ANY failed EVALSHA (timeouts included); a SCRIPT LOAD per failure
// turns a slow Redis into a reload storm. A body's SHA never changes, so load once; only NOSCRIPT reloads.
const shaByScript = new Map<string, Promise<string>>();
const scriptBySha = new Map<string, string>();
const reloadingByScript = new Map<string, Promise<unknown>>();

const sendScriptLoad = ({ script }: { script: string }) =>
	getMiscRedis().script("LOAD", script) as Promise<string>;

const loadScript = ({ script }: { script: string }): Promise<string> => {
	const cached = shaByScript.get(script);
	if (cached) return cached;
	const loading = sendScriptLoad({ script }).then((sha) => {
		scriptBySha.set(sha, script);
		return sha;
	});
	loading.catch(() => shaByScript.delete(script));
	shaByScript.set(script, loading);
	return loading;
};

/** One SCRIPT LOAD in flight per body, however many callers saw NOSCRIPT at once. */
const reloadScript = ({ script }: { script: string }) => {
	const inFlight = reloadingByScript.get(script);
	if (inFlight) return inFlight;
	const reloading = sendScriptLoad({ script }).finally(() =>
		reloadingByScript.delete(script),
	);
	reloadingByScript.set(script, reloading);
	return reloading;
};

const isNoScriptError = (error: unknown) =>
	error instanceof Error && error.message.startsWith("NOSCRIPT");

const evalSha = <TData>({
	sha,
	keys,
	args,
}: {
	sha: string;
	keys: string[];
	args: unknown[];
}) =>
	getMiscRedis().evalsha(
		sha,
		keys.length,
		...keys,
		...(args as (string | number | Buffer)[]),
	) as Promise<TData>;

export const createRateLimitRedisStore = <TEnv extends Env = Env>() =>
	new RedisStore<TEnv>({
		client: {
			scriptLoad: (script: string) => loadScript({ script }),
			evalsha: async <TArgs extends unknown[], TData = unknown>(
				sha: string,
				keys: string[],
				args: TArgs,
			): Promise<TData> => {
				try {
					return await evalSha<TData>({ sha, keys, args });
				} catch (error) {
					const script = scriptBySha.get(sha);
					if (!script || !isNoScriptError(error)) throw error;
					await reloadScript({ script });
					return evalSha<TData>({ sha, keys, args });
				}
			},
			decr: (key: string) => getMiscRedis().decr(key),
			del: (key: string) => getMiscRedis().del(key),
		},
	});
