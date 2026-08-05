import type { Redis } from "ioredis";
import { tryRedisOp } from "./runRedisOp.js";

/** Routes a SET ... NX to its three outcomes: "OK" → onSuccess, null (key
 *  exists) → onKeyAlreadyExists, Redis down/error → onRedisUnavailable. */
export const tryRedisNx = async <TUnavailable, TSuccess, TExists>({
	operation,
	source,
	redisInstance,
	onRedisUnavailable,
	onSuccess,
	onKeyAlreadyExists,
}: {
	operation: () => Promise<"OK" | null>;
	source: string;
	redisInstance: Redis;
	onRedisUnavailable: () => TUnavailable | Promise<TUnavailable>;
	onSuccess: () => TSuccess | Promise<TSuccess>;
	onKeyAlreadyExists: () => TExists | Promise<TExists>;
}): Promise<TUnavailable | TSuccess | TExists> => {
	const result = await tryRedisOp({ operation, source, redisInstance });

	if (result === undefined) return await onRedisUnavailable();
	if (result === "OK") return await onSuccess();
	return await onKeyAlreadyExists();
};
