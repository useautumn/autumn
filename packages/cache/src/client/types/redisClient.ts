import type { AutumnLogger } from "@autumn/logging";
import type { Redis } from "ioredis";

/** The slice of the shared logger a cache op writes to. */
export type CacheLogger = Pick<AutumnLogger, "info" | "warn" | "error">;

/** What a process may add to a fresh client before it is used: tracing, custom commands. */
export type OnClientCreated = (params: { redis: Redis; label: string }) => void;

export type RedisClientContext = {
	logger?: CacheLogger;
	onClientCreated?: OnClientCreated;
};

export type RedisClientConfig = {
	url: string;
	/** Names the connection in logs and traces, e.g. "misc-primary" or "us-east-2:backup". */
	label: string;
	/** The only bound on how long a command may wait once sent. */
	commandTimeoutMs: number;
	/** Off for a connection whose pending commands must fail on reconnect instead of replaying. */
	autoResendUnfulfilledCommands?: boolean;
	/** null lets `commandTimeoutMs` be the sole bound; 0 fails pending commands on the first reconnect. */
	maxRetriesPerRequest?: number | null;
};
