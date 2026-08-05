import type { Redis } from "ioredis";
import { isConnectionLevelRedisError } from "../utils/isTransientRedisError.js";

const FAILURES_TO_PENALIZE = 3;
const PENALTY_MS = 5_000;

type ConnectionHealth = {
	consecutiveFailures: number;
	penalizedUntil: number;
};

export type StandbyRedisPair = {
	primary: Redis;
	standby: Redis;
	/** Preferred connection first, then the alternate. */
	ordered: () => [Redis, Redis];
	recordOutcome: (args: { connection: Redis; error?: unknown }) => void;
};

const pairsByPrimary = new WeakMap<Redis, StandbyRedisPair>();

export const getStandbyRedisPair = (
	redis: Redis,
): StandbyRedisPair | undefined => pairsByPrimary.get(redis);

/** Pairs a second connection to the same endpoint with `primary` and returns
 *  `primary`, so callers keep holding a plain client. */
export const registerStandbyRedis = ({
	primary,
	standby,
}: {
	primary: Redis;
	standby: Redis;
}): Redis => {
	const health = new Map<Redis, ConnectionHealth>([
		[primary, { consecutiveFailures: 0, penalizedUntil: 0 }],
		[standby, { consecutiveFailures: 0, penalizedUntil: 0 }],
	]);

	const isUsable = (connection: Redis): boolean =>
		connection.status === "ready" &&
		Date.now() >= (health.get(connection)?.penalizedUntil ?? 0);

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
		const entry = health.get(connection);
		if (!entry) return;

		// A deterministic reply (WRONGTYPE, OOM) proves the socket round-tripped,
		// so it clears the streak exactly like a success does.
		if (error === undefined || !isConnectionLevelRedisError({ error })) {
			entry.consecutiveFailures = 0;
			return;
		}

		// A half-open socket keeps reporting `ready` while every command times
		// out, so status alone can never take it out of rotation.
		entry.consecutiveFailures += 1;
		if (entry.consecutiveFailures < FAILURES_TO_PENALIZE) return;
		entry.penalizedUntil = Date.now() + PENALTY_MS;
		entry.consecutiveFailures = 0;
	};

	pairsByPrimary.set(primary, { primary, standby, ordered, recordOutcome });
	return primary;
};

/** `ready` when either connection can serve, so a flap on one does not read as
 *  an outage. Falls back to the plain status for unpaired clients. */
export const redisStatusWithStandby = (redis: Redis): string => {
	const pair = getStandbyRedisPair(redis);
	if (!pair) return redis.status;
	return pair.primary.status === "ready" || pair.standby.status === "ready"
		? "ready"
		: pair.primary.status;
};

export const isRedisReadyWithStandby = (redis: Redis): boolean =>
	redisStatusWithStandby(redis) === "ready";

/** Per-connection detail for logs, since the merged status hides which half
 *  of a pair is degraded. */
export const describeRedisWithStandby = (redis: Redis): string => {
	const pair = getStandbyRedisPair(redis);
	if (!pair) return redis.status;
	return `primary=${pair.primary.status},standby=${pair.standby.status}`;
};

export const forEachRedisWithStandby = (
	redis: Redis,
	run: (connection: Redis) => void,
): void => {
	const pair = getStandbyRedisPair(redis);
	if (!pair) {
		run(redis);
		return;
	}
	run(pair.primary);
	run(pair.standby);
};
