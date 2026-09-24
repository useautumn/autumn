import type {
	MiscRedisConfig,
	MiscRedisInstanceName,
} from "@autumn/edge-config";
import type { Redis } from "ioredis";
import type {
	RedisClientConfig,
	RedisClientContext,
} from "../../client/types/redisClient.js";

export type MiscCacheContext = RedisClientContext & {
	/** Live: read on every call, from an edge config store the process polls. */
	config: () => MiscRedisConfig;
	env: {
		/** Null where no misc cache is configured; opening one then throws. */
		mainUrl: string | null;
		region: string;
		onEcs: boolean;
	};
	/** Decrypts a backup connection string the edge config stores encrypted. */
	decrypt: (encrypted: string) => string;
	/** Tests only; a process lets the package open real connections. */
	createClient?: (params: {
		ctx: RedisClientContext;
		config: RedisClientConfig;
	}) => Redis;
};

export type MiscCacheConfig = {
	commandTimeoutMs: number;
};

export type MiscCacheTarget = {
	instanceName: MiscRedisInstanceName;
	redis: Redis;
};

/** The misc cache: cross-request state (locks, reservations, suppression keys) every process shares. */
export type MiscCache = {
	/** The instance the edge config points at; backup falls back to main while it is unroutable. */
	getActive(): Redis;
	getMain(): Redis;
	/** Null while no backup is configured or its connection cannot be decrypted. */
	getBackup(): Redis | null;
	/** For read-through caches only: a slice of requests, bucketed on requestId, reads from the ramp target. */
	resolve(params: { requestId?: string }): Redis;
	/** Every instance that may be serving reads: the active one, plus the ramp target whenever a ramp exists. */
	targets(): MiscCacheTarget[];
	/** Runs an operation against every live target, fail-open per instance. */
	forEachTarget<T>(params: {
		operation: (target: MiscCacheTarget) => Promise<T>;
		onError?: (params: { target: MiscCacheTarget; error: unknown }) => void;
	}): Promise<PromiseSettledResult<T>[]>;
	/** Read a cross-request key from the active instance first, then any other live target. */
	getFromTargets(params: {
		key: string;
		source: string;
		onError?: (error: unknown) => void;
	}): Promise<string | null>;
	/** Write-through for coordination keys: the same SET lands on every live instance. */
	setOnTargets(params: {
		key: string;
		value: string;
		ttlMs: number;
		source: string;
		onError?: (error: unknown) => void;
	}): Promise<void>;
	/** Best-effort copy of a won lock to the ramp target; the NX decision stays with the active instance. */
	mirrorSetOnRampTarget(params: {
		key: string;
		value: string;
		ttlMs: number;
		source: string;
	}): Promise<void>;
	close(): void;
};
