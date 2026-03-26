import type { OrgRedisConfig } from "@autumn/shared";
import { Redis } from "ioredis";

/** Narrow type for functions that only need org.id + org.redis_config. */
export type OrgWithRedisConfig = {
	id: string;
	redis_config?: OrgRedisConfig | null;
};

import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { instrumentRedis } from "@/utils/otel/instrumentRedis.js";
import {
	configureRedisInstance,
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "./initRedis.js";

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
	const instance = new Redis(connectionString, {
		family: 4,
		keepAlive: 10000,
		// TLS is handled by the connection string itself (rediss://)
	});

	instrumentRedis({ redis: instance, region: `org:${orgId}` });
	configureRedisInstance(instance);

	instance.on("error", (error) => {
		console.error(`[OrgRedis] org=${orgId}: ${error.message}`);
	});

	instance.on("ready", () => {
		console.log(`[OrgRedis] org=${orgId}: connected`);
	});

	return instance;
};

/** Returns the org's dedicated Redis instance from the connection pool.
 *  Falls back to master if no redis_config is set or decryption fails.
 *  Self-heals on URL changes for the org pool entry.
 */
export const getOrgRedis = ({ org }: { org: OrgWithRedisConfig }): Redis => {
	if (!org.redis_config) return redis;

	const existing = pool.get(org.id);
	if (existing) {
		if (existing.url === org.redis_config.url) return existing.instance;
		// URL changed — disconnect stale connection and fall through to recreate
		existing.instance.disconnect();
		pool.delete(org.id);
	}

	let connectionString: string;
	try {
		connectionString = decryptData(org.redis_config.connectionString);
	} catch {
		console.error(
			`[OrgRedis] Failed to decrypt redis_config for org ${org.id}, falling back to master Redis`,
		);
		return redis;
	}

	const instance = createOrgRedisConnection({
		connectionString,
		orgId: org.id,
	});
	pool.set(org.id, { instance, url: org.redis_config.url });
	return instance;
};

/** Returns the pooled Redis instance for the given orgId if it exists in the pool.
 *  Returns null if the org has no pooled connection (uses master Redis).
 *  Used by batch operations that don't have access to the full org object.
 */
export const getPooledOrgRedis = ({
	orgId,
}: {
	orgId: string;
}): Redis | null => {
	return pool.get(orgId)?.instance ?? null;
};

/** Removes an org's Redis connection from the pool and disconnects it.
 *  Call this when an org's redis_config is explicitly removed or changed,
 *  as a best-effort cleanup (self-healing in getOrgRedis handles the URL-change case).
 */
export const removeOrgRedis = ({ orgId }: { orgId: string }): void => {
	const existing = pool.get(orgId);
	if (!existing) return;
	existing.instance.disconnect();
	pool.delete(orgId);
};

/** Runs a cache invalidation operation across all relevant Redis instances for an org.
 *  When migrationPercent is provided, only hits the instances that actually hold data:
 *  - > 0: org's dedicated Redis has some customers
 *  - < 100: master Redis regions still have some customers
 *  Without migrationPercent, hits both sides (safe default for callers without org context).
 */
export const invalidateCache = async ({
	orgId,
	fn,
	migrationPercent,
}: {
	orgId: string;
	fn: (instance: Redis, label: string) => Promise<void>;
	migrationPercent?: number;
}): Promise<void> => {
	const promises: Promise<void>[] = [];

	const shouldHitOrg = migrationPercent === undefined || migrationPercent > 0;
	const shouldHitMaster =
		migrationPercent === undefined || migrationPercent < 100;

	if (shouldHitOrg) {
		const orgRedis = getPooledOrgRedis({ orgId });
		if (orgRedis?.status === "ready") {
			promises.push(fn(orgRedis, `org:${orgId}`));
		}
	}

	if (shouldHitMaster) {
		const regions = getConfiguredRegions();
		for (const region of regions) {
			const instance = getRegionalRedis(region);
			if (instance.status !== "ready") continue;
			promises.push(fn(instance, region));
		}
	}

	await Promise.all(promises);
};

/** Pre-warms Redis connections for all orgs that have redis_config set.
 *  Called at server startup as fire-and-forget — does NOT block startup.
 *  Connections establish in the background; requests in the meantime
 *  fall back to Postgres via fail-open behaviour.
 */
export const preWarmOrgRedisConnections = async ({
	db,
}: {
	db: DrizzleCli;
}): Promise<void> => {
	const orgsWithRedis = await OrgService.listWithRedisConfig({ db });

	if (orgsWithRedis.length === 0) return;

	console.log(
		`[OrgRedis] Pre-warming connections for ${orgsWithRedis.length} orgs...`,
	);

	for (const org of orgsWithRedis) {
		getOrgRedis({ org });
	}
};
