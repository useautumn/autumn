import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";

/**
 * Wraps a Redis client's `hdel`, `del`, `unlink` so any call targeting a
 * `shared_balances:*` key is logged. Diagnostic only — remove once the
 * silent-deletion bug is identified.
 */
export const instrumentBalanceMutations = ({ redis }: { redis: Redis }) => {
	const wrap = (method: "hdel" | "del" | "unlink") => {
		const original = redis[method].bind(redis) as (
			...args: unknown[]
		) => Promise<unknown>;
		(redis as unknown as Record<string, unknown>)[method] = (
			...args: unknown[]
		) => {
			const first = args[0];
			if (typeof first === "string" && first.includes("shared_balances")) {
				logger.warn(`[balance-mutation] ${method.toUpperCase()} ${first}`);
			}
			return original(...args);
		};
	};

	wrap("hdel");
	wrap("del");
	wrap("unlink");
};
