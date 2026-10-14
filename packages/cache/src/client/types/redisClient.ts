import type { AutumnLogger } from "@autumn/logging";
import type { Redis } from "ioredis";

export type CacheLogger = Pick<AutumnLogger, "info" | "warn" | "error">;

export type OnClientCreated = (params: { redis: Redis; label: string }) => void;

export type RedisClientContext = {
	logger?: CacheLogger;
	onClientCreated?: OnClientCreated;
};

export type RedisClientConfig = {
	url: string;
	label: string;
	commandTimeoutMs: number;
	autoResendUnfulfilledCommands?: boolean;
	maxRetriesPerRequest?: number | null;
};
