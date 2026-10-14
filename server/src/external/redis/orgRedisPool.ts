import type { OrgRedisConfig } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { getReachableDragonflyUrl } from "./getReachableDragonflyUrl.js";
import {
	createPooledStandbyRedisConnection,
	currentRegion,
} from "./initRedis.js";
import { REDIS_V2_COMMAND_TIMEOUT_MS } from "./initUtils/createRedisClient.js";
import { waitForRedisReadPoolReady } from "./initUtils/redisWarmup.js";
import { resolveRedisV2 } from "./resolveRedisV2.js";

export type OrgWithRedisConfig = {
	id: string;
	slug?: string;
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
	orgSlug,
}: {
	connectionString: string;
	orgId: string;
	orgSlug: string;
}): Redis => {
	const instance = createPooledStandbyRedisConnection({
		cacheUrl: connectionString,
		region: `org:${orgSlug}:v2:dragonfly`,
		redisType: `subject-dedicated:${orgSlug}`,
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

const resolveOrgConnectionString = ({
	redisConfig,
	orgId,
}: {
	redisConfig: OrgRedisConfig;
	orgId: string;
}): string => {
	if (onAwsEcs()) return decryptData(redisConfig.connectionString);

	if (redisConfig.publicConnectionString) {
		return decryptData(redisConfig.publicConnectionString);
	}

	logger.warn(
		`[OrgRedis] org=${orgId}: no publicConnectionString set, falling back to private connectionString off-AWS`,
	);
	return decryptData(redisConfig.connectionString);
};

export const getOrgRedis = ({ org }: { org: OrgWithRedisConfig }): Redis => {
	if (!org.redis_config) return resolveRedisV2();

	const existing = pool.get(org.id);
	if (existing) {
		if (existing.url === org.redis_config.url) return existing.instance;
		existing.instance.disconnect();
		pool.delete(org.id);
	}

	let connectionString: string;
	try {
		connectionString = resolveOrgConnectionString({
			redisConfig: org.redis_config,
			orgId: org.id,
		});
	} catch (error) {
		logger.error(
			`[OrgRedis] Failed to decrypt redis_config for org ${org.id}, falling back to shared Redis V2`,
		);
		if (error instanceof Error) {
			logger.error(error);
		}
		return resolveRedisV2();
	}

	const instance = createOrgRedisConnection({
		connectionString: getReachableDragonflyUrl(connectionString),
		orgId: org.id,
		orgSlug: org.slug ?? org.id,
	});
	pool.set(org.id, { instance, url: org.redis_config.url });
	return instance;
};

const ORG_REDIS_WARMUP_TIMEOUT_MS = 5000;

export const warmOrgRedis = async ({
	org,
}: {
	org: OrgWithRedisConfig;
}): Promise<void> => {
	if (!org.redis_config) return;

	const instance = getOrgRedis({ org });

	try {
		await waitForRedisReadPoolReady({
			instance,
			label: `org:${org.slug ?? org.id}`,
			timeoutMs: ORG_REDIS_WARMUP_TIMEOUT_MS,
		});
	} catch (error) {
		logger.warn(
			`[OrgRedis] org=${org.id}: warmup failed (continuing): ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
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

	await Promise.all(orgsWithRedis.map((org) => warmOrgRedis({ org })));
};
