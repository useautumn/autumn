import type { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

/** Where the admin bucket lives; each app resolves it from its own env. */
export type EdgeConfigLocation = { bucket: string; region: string };

/** The two calls the stores make; any app logger satisfies it. */
export type EdgeConfigLogger = {
	warn: (message: string) => void;
	error: (message: string) => void;
};

/** Shaped like the SDK's `send()` so a real SDK client stays injectable in tests and scripts. */
export type EdgeConfigS3Client = {
	send: (command: GetObjectCommand | PutObjectCommand) => Promise<{
		Body?: { transformToString: (encoding?: string) => Promise<string> };
	}>;
};

export type EdgeConfigStatus = {
	configured: boolean;
	healthy: boolean;
	lastFetchAt?: string;
	lastSuccessAt?: string;
	error?: string;
};

/** What every store and the registry need from the app: the bucket, and optionally a client and logger. */
export type EdgeConfigContext = {
	location: () => EdgeConfigLocation;
	s3Client?: EdgeConfigS3Client;
	logger?: EdgeConfigLogger;
};
