import type { AutumnLogger } from "@autumn/logging";
import type { Redis } from "ioredis";

export type CacheConfiguration = {
	createRedisClient: (params: {
		cacheUrl: string;
		region: string;
		redisType: "misc-primary" | "misc-secondary";
	}) => Redis;
	decryptConnectionString: (encrypted: string) => string;
	resolveMainRedisUrl: () => string | null;
	resolvePrivateOrPublicUrl: ({
		privateUrl,
		publicUrl,
	}: {
		privateUrl: string | null;
		publicUrl: string;
	}) => string;
	region: string;
	logger: AutumnLogger;
};

let cacheConfiguration: CacheConfiguration | undefined;

export const configureCache = ({
	configuration,
}: {
	configuration: CacheConfiguration;
}): void => {
	if (cacheConfiguration && cacheConfiguration !== configuration) {
		throw new Error("@autumn/cache has already been configured");
	}
	cacheConfiguration = configuration;
};

export const getCacheConfiguration = (): CacheConfiguration => {
	if (!cacheConfiguration) {
		throw new Error(
			"@autumn/cache is not configured; call configureCache before using Redis",
		);
	}
	return cacheConfiguration;
};

export const createConfiguredRedisClient = ({
	cacheUrl,
	region,
	redisType,
}: {
	cacheUrl: string;
	region: string;
	redisType: "misc-primary" | "misc-secondary";
}): Redis =>
	getCacheConfiguration().createRedisClient({
			cacheUrl,
			region,
			redisType,
	});
