import type { RedisConnectionState } from "./redisConnectionState.js";

export type RegisteredRedisConnection = {
	connectionId: number;
	name: string;
	redisType: string;
	reconnectCount: number;
	connectionErrors: number;
	getState?: () => RedisConnectionState;
};
