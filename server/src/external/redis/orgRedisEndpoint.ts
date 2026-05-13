import type { OrgRedisConfig } from "@autumn/shared";

export type OrgRedisRuntime = "default" | "worker";

export const getOrgRedisRuntime = (): OrgRedisRuntime =>
	process.env.AUTUMN_PROCESS_TYPE === "worker" ? "worker" : "default";

export const getOrgRedisEndpoint = ({
	redisConfig,
	runtime = getOrgRedisRuntime(),
}: {
	redisConfig: OrgRedisConfig;
	runtime?: OrgRedisRuntime;
}) => {
	if (
		runtime === "worker" &&
		redisConfig.workerConnectionString &&
		redisConfig.workerUrl
	) {
		return {
			connectionString: redisConfig.workerConnectionString,
			url: redisConfig.workerUrl,
			runtime,
		};
	}

	return {
		connectionString: redisConfig.connectionString,
		url: redisConfig.url,
		runtime: "default" as const,
	};
};
