import type { Entity } from "@autumn/shared";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { deleteCachedFullCustomer } from "./deleteCachedFullCustomer.js";
import { buildFullCustomerCacheKey } from "./fullCustomerCacheConfig.js";

type UpdateEntityInCacheResult = {
	ok: boolean;
	updatedCount?: number;
	error?: string;
};

const shouldDeleteCache = ({ error }: { error?: string }) => {
	return (
		error === "no_entities" ||
		error === "empty_entities" ||
		error === "entity_not_found"
	);
};

export const updateEntityInCache = async ({
	ctx,
	customerId,
	idOrInternalId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	idOrInternalId: string;
	updates: Partial<Pick<Entity, "spend_limits">>;
}): Promise<UpdateEntityInCacheResult | null> => {
	try {
		if (Object.keys(updates).length === 0) {
			return { ok: true, updatedCount: 0 };
		}

		const { org, env, logger } = ctx;

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		const result = await tryRedisWrite(async () => {
			return await redis.updateEntityInCustomer(
				cacheKey,
				JSON.stringify({
					id_or_internal_id: idOrInternalId,
					updates,
				}),
			);
		});

		if (result === null) {
			logger.warn(
				`[updateEntityInCache] Redis write failed for entity ${idOrInternalId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			ok: boolean;
			updated_count?: number;
			error?: string;
		};

		if (parsed.ok) {
			return {
				ok: true,
				updatedCount: parsed.updated_count,
			};
		}

		if (parsed.error === "cache_miss") {
			return {
				ok: false,
				error: parsed.error,
			};
		}

		if (shouldDeleteCache({ error: parsed.error })) {
			await deleteCachedFullCustomer({
				ctx,
				customerId,
				source: "updateEntityInCache",
			});
		}

		logger.warn(
			`[updateEntityInCache] entity ${idOrInternalId}: ${parsed.error ?? "unknown_error"}`,
		);

		return {
			ok: false,
			error: parsed.error,
		};
	} catch (error) {
		ctx.logger.error(
			`[updateEntityInCache] entity ${idOrInternalId}: error, ${error}`,
		);
		return null;
	}
};
