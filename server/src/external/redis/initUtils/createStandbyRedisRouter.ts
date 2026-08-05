import type { Redis } from "ioredis";
import { isConnectionLevelRedisError } from "../utils/isTransientRedisError.js";
import { firstPipelineConnectionError } from "../utils/pipelineErrors.js";

const STANDBY_ROUTER = Symbol("redisStandbyRouter");

const FAILURES_TO_PENALIZE = 3;
const PENALTY_MS = 5_000;

type StandbyConnections = {
	primary: Redis;
	standby: Redis;
};

export type StandbyRedisRouter = {
	/** Preferred connection first, then the alternate. Never empty. */
	ordered: () => [Redis, Redis];
	recordOutcome: (args: { connection: Redis; error?: unknown }) => void;
};

type ConnectionHealth = {
	consecutiveFailures: number;
	penalizedUntil: number;
};

/** Return a live object pinned to one connection rather than a command result. */
const BATCH_METHODS = new Set(["pipeline", "multi"]);
const PASSTHROUGH_METHODS = new Set(["duplicate", "defineCommand"]);

const LISTENER_METHODS = new Set([
	"addListener",
	"off",
	"on",
	"once",
	"prependListener",
	"removeAllListeners",
	"removeListener",
]);

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
	typeof (value as PromiseLike<unknown> | null)?.then === "function";

export const getStandbyRedisRouter = (
	redis: Redis,
): StandbyRedisRouter | undefined =>
	(Reflect.get(redis, STANDBY_ROUTER) as StandbyRedisRouter | undefined) ??
	undefined;

/** Per-connection status for logs — the router's own `status` hides which of
 *  the pair is degraded, which is the thing you need during an incident. */
export const describeRedisConnections = (redis: Redis): string | undefined => {
	const router = getStandbyRedisRouter(redis);
	if (!router) return undefined;
	const [preferred, alternate] = router.ordered();
	return `preferred=${preferred.status},alternate=${alternate.status}`;
};

export const createStandbyRedisRouter = ({
	primary,
	standby,
}: StandbyConnections): Redis => {
	const primaryHealth: ConnectionHealth = {
		consecutiveFailures: 0,
		penalizedUntil: 0,
	};
	const standbyHealth: ConnectionHealth = {
		consecutiveFailures: 0,
		penalizedUntil: 0,
	};
	const healthOf = (connection: Redis): ConnectionHealth | undefined => {
		if (connection === primary) return primaryHealth;
		if (connection === standby) return standbyHealth;
		return undefined;
	};

	const isUsable = (connection: Redis): boolean =>
		connection.status === "ready" &&
		Date.now() >= (healthOf(connection)?.penalizedUntil ?? 0);

	// Sticky to primary while it is usable: a request's writes should not
	// straddle connections just because both are healthy.
	const ordered = (): [Redis, Redis] =>
		!isUsable(primary) && isUsable(standby)
			? [standby, primary]
			: [primary, standby];

	const recordOutcome = ({
		connection,
		error,
	}: {
		connection: Redis;
		error?: unknown;
	}) => {
		const entry = healthOf(connection);
		if (!entry) return;

		// A deterministic reply (WRONGTYPE, OOM) is proof the socket round-tripped,
		// so it clears the streak exactly like a success does.
		if (error === undefined || !isConnectionLevelRedisError({ error })) {
			entry.consecutiveFailures = 0;
			return;
		}

		entry.consecutiveFailures += 1;
		if (entry.consecutiveFailures < FAILURES_TO_PENALIZE) return;
		entry.penalizedUntil = Date.now() + PENALTY_MS;
		entry.consecutiveFailures = 0;
	};

	const router: StandbyRedisRouter = { ordered, recordOutcome };

	const observeOutcome = ({
		result,
		connection,
		resolvedError,
	}: {
		result: unknown;
		connection: Redis;
		resolvedError?: (resolved: unknown) => unknown;
	}) => {
		if (!isPromiseLike(result)) return result;
		return Promise.resolve(result).then(
			(resolved) => {
				recordOutcome({ connection, error: resolvedError?.(resolved) });
				return resolved;
			},
			(error: unknown) => {
				recordOutcome({ connection, error });
				throw error;
			},
		);
	};

	const observeBatch = ({
		batch,
		connection,
	}: {
		batch: unknown;
		connection: Redis;
	}) => {
		const pipeline = batch as { exec: (...args: unknown[]) => unknown };
		if (typeof pipeline?.exec !== "function") return batch;
		const exec = pipeline.exec.bind(pipeline);
		pipeline.exec = (...args: unknown[]) =>
			observeOutcome({
				result: exec(...args),
				connection,
				// A dead socket surfaces as `[Error, null]` tuples on a resolved
				// exec, so the promise settling is not proof the connection works.
				resolvedError: firstPipelineConnectionError,
			});
		return pipeline;
	};

	// `once` must stay one-shot across the pair while still firing for a
	// standby-only event; the wrapper is tracked so `off(handler)` can find it.
	const onceWrappers = new Map<
		(...args: unknown[]) => void,
		(...args: unknown[]) => void
	>();

	const fanOutListener = (property: string, proxy: Redis) => {
		if (property === "once") {
			return (event: string, handler: (...args: unknown[]) => void) => {
				let fired = false;
				const wrapped = (...args: unknown[]) => {
					if (fired) return;
					fired = true;
					primary.off(event, wrapped);
					standby.off(event, wrapped);
					onceWrappers.delete(handler);
					handler(...args);
				};
				onceWrappers.set(handler, wrapped);
				primary.once(event, wrapped);
				standby.once(event, wrapped);
				return proxy;
			};
		}

		return (...args: unknown[]) => {
			const handler = args[1] as ((...inner: unknown[]) => void) | undefined;
			const wrapped = handler && onceWrappers.get(handler);
			const effective = wrapped ? [args[0], wrapped, ...args.slice(2)] : args;
			if (wrapped) onceWrappers.delete(handler);

			for (const connection of [primary, standby]) {
				Reflect.apply(
					Reflect.get(connection, property, connection),
					connection,
					effective,
				);
			}
			return proxy;
		};
	};

	const proxy: Redis = new Proxy({} as Redis, {
		get(_target, property) {
			if (property === STANDBY_ROUTER) return router;
			if (property === "status") {
				return primary.status === "ready" || standby.status === "ready"
					? "ready"
					: primary.status;
			}
			if (property === "disconnect") {
				return (...args: unknown[]) => {
					Reflect.apply(primary.disconnect, primary, args);
					Reflect.apply(standby.disconnect, standby, args);
				};
			}
			if (property === "quit") {
				return async (...args: unknown[]) => {
					const [result] = await Promise.all([
						Reflect.apply(primary.quit, primary, args),
						Reflect.apply(standby.quit, standby, args),
					]);
					return result;
				};
			}
			if (typeof property === "string" && LISTENER_METHODS.has(property)) {
				return fanOutListener(property, proxy);
			}

			const [selected] = ordered();
			const value = Reflect.get(selected, property, selected);
			if (typeof value !== "function") return value;

			if (typeof property === "string" && PASSTHROUGH_METHODS.has(property)) {
				return value.bind(selected);
			}

			// A batch is pinned to `selected` for its whole life, so it cannot fail
			// over; observing its `exec()` at least keeps the breaker informed.
			if (typeof property === "string" && BATCH_METHODS.has(property)) {
				return (...args: unknown[]) =>
					observeBatch({
						batch: Reflect.apply(value, selected, args),
						connection: selected,
					});
			}

			return (...args: unknown[]) =>
				observeOutcome({
					result: Reflect.apply(value, selected, args) as unknown,
					connection: selected,
				});
		},
		set(_target, property, value) {
			return (
				Reflect.set(primary, property, value) &&
				Reflect.set(standby, property, value)
			);
		},
		has(_target, property) {
			return property === STANDBY_ROUTER || Reflect.has(primary, property);
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(primary);
		},
	});

	return proxy;
};
