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
	config: () => MiscRedisConfig;
	env: {
		mainUrl: string | null;
		region: string;
		onEcs: boolean;
	};
	decrypt: (encrypted: string) => string;
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

export type MiscCache = {
	getActive(): Redis;
	getMain(): Redis;
	getBackup(): Redis | null;
	resolve(params: { requestId?: string }): Redis;
	targets(): MiscCacheTarget[];
	forEachTarget<T>(params: {
		operation: (target: MiscCacheTarget) => Promise<T>;
		onError?: (params: { target: MiscCacheTarget; error: unknown }) => void;
	}): Promise<PromiseSettledResult<T>[]>;
	getFromTargets(params: {
		key: string;
		source: string;
		onError?: (error: unknown) => void;
	}): Promise<string | null>;
	setOnTargets(params: {
		key: string;
		value: string;
		ttlMs: number;
		source: string;
		onError?: (error: unknown) => void;
	}): Promise<void>;
	mirrorSetOnRampTarget(params: {
		key: string;
		value: string;
		ttlMs: number;
		source: string;
	}): Promise<void>;
	close(): void;
};
