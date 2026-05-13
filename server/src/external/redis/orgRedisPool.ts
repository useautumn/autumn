import type { OrgRedisConfig } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { createRedisConnection, currentRegion } from "./initRedis.js";
import { REDIS_V2_COMMAND_TIMEOUT_MS } from "./initUtils/redisV2Config.js";
import { getOrgRedisEndpoint } from "./orgRedisEndpoint.js";
import { resolveRedisV2 } from "./resolveRedisV2.js";

export type OrgWithRedisConfig = {
	id: string;
	redis_config?: OrgRedisConfig | null;
};

type PoolEntry = {
	instance: Redis;
	url: string;
};

const pool = new Map<string, PoolEntry>();

const createOrgRedisConnection = ({
	connectionString,
	orgId,
}: {
	connectionString: string;
	orgId: string;
}): Redis => {
	const instance = createRedisConnection({
		cacheUrl: connectionString,
		region: `org:${orgId}:v2:dragonfly`,
		supportsUpstashShebang: false,
		commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
	});

	instance.on("error", (error) => {
		logger.error(`[OrgRedis] org=${orgId}: ${error.message}`);
	});

	instance.on("ready", () => {
		logger.info(`[OrgRedis] org=${orgId}: connected`);
	});

	return instance;
};

export const getOrgRedis = ({ org }: { org: OrgWithRedisConfig }): Redis => {
	if (!org.redis_config) return resolveRedisV2();

	const endpoint = getOrgRedisEndpoint({ redisConfig: org.redis_config });
	const existing = pool.get(org.id);
	if (existing) {
		if (existing.url === endpoint.url) return existing.instance;
		existing.instance.disconnect();
		pool.delete(org.id);
	}

	let connectionString: string;
	try {
		connectionString = decryptData(endpoint.connectionString);
	} catch (error) {
		logger.error(
			`[OrgRedis] Failed to decrypt ${endpoint.runtime} redis_config for org ${org.id}, falling back to shared Redis V2`,
		);
		if (error instanceof Error) {
			logger.error(error);
		}
		return resolveRedisV2();
	}

	const instance = createOrgRedisConnection({
		connectionString,
		orgId: org.id,
	});
	pool.set(org.id, { instance, url: endpoint.url });
	return instance;
};

export const removeOrgRedis = ({ orgId }: { orgId: string }): void => {
	const existing = pool.get(orgId);
	if (!existing) return;
	existing.instance.disconnect();
	pool.delete(orgId);
};

export const preWarmOrgRedisConnections = async ({
	db,
}: {
	db: DrizzleCli;
}): Promise<void> => {
	const orgsWithRedis = await OrgService.listWithRedisConfig({ db });

	if (orgsWithRedis.length === 0) return;

	logger.info(
		`[OrgRedis] Pre-warming connections for ${orgsWithRedis.length} orgs in ${currentRegion}...`,
	);

	for (const org of orgsWithRedis) {
		getOrgRedis({ org });
	}
};
