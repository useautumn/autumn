import type { InsertCustomerProduct } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCachedCustomerProduct } from "@/internal/customers/cusProducts/actions/cache/updateCachedCustomerProduct.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../config/fullSubjectCacheConfig.js";

type UpdateCachedSubjectCustomerProductResult = {
	success: boolean;
	updatedFields?: string[];
	cacheMiss?: boolean;
	cusProductNotFound?: boolean;
	error?: string;
};

export const updateCachedCustomerProductV2 = async ({
	ctx,
	customerId,
	customerProductId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerProductId: string;
	updates: Partial<InsertCustomerProduct>;
}): Promise<UpdateCachedSubjectCustomerProductResult | null> => {
	try {
		// Update v1 cache, to remove later on
		await updateCachedCustomerProduct({
			ctx,
			customerId,
			cusProductId: customerProductId,
			updates,
		});
	} catch (error) {
		ctx.logger.error(
			`[updateCachedCustomerProductV2] error updating v1 cache for customer ${customerId}, cusProduct ${customerProductId}: ${error}`,
		);
	}

	try {
		if (!customerId) {
			ctx.logger.warn(
				`[updateCachedCustomerProductV2] Skipping subject cache update for cusProduct ${customerProductId} because customerId is missing`,
			);
			return null;
		}

		if (Object.keys(updates).length === 0) return null;
		const { org, env, logger } = ctx;
		const subjectKey = buildFullSubjectKey({
			orgId: org.id,
			env,
			customerId,
		});
		const paramsJson = JSON.stringify({
			cus_product_id: customerProductId,
			updates,
		});

		const result = await tryRedisWrite(
			() =>
				redisV2.updateFullSubjectCustomerProductV2(
					subjectKey,
					paramsJson,
					String(FULL_SUBJECT_CACHE_TTL_SECONDS),
					String(Date.now()),
				),
			redisV2,
		);

		if (result === null) {
			logger.warn(
				`[updateCachedCustomerProductV2] Redis write failed for customer ${customerId}, cusProduct ${customerProductId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			success: boolean;
			updated_fields?: string[];
			cache_miss?: boolean;
			cus_product_not_found?: boolean;
			error?: string;
		};

		if (parsed.cus_product_not_found) {
			logger.warn(
				`[updateCachedCustomerProductV2] customer product ${customerProductId} not found in cached subject for ${customerId}, skipping cache patch`,
			);
		}

		if (
			!parsed.success &&
			!parsed.cache_miss &&
			!parsed.cus_product_not_found
		) {
			logger.warn(
				`[updateCachedCustomerProductV2] Lua script error for customer ${customerId}, cusProduct ${customerProductId}: ${parsed.error ?? "unknown_error"}`,
			);
		}

		return {
			success: parsed.success,
			updatedFields: parsed.updated_fields,
			cacheMiss: parsed.cache_miss,
			cusProductNotFound: parsed.cus_product_not_found,
			error: parsed.error,
		};
	} catch (error) {
		ctx.logger.error(
			`[updateCachedCustomerProductV2] cusProduct ${customerProductId}: error, ${error}`,
		);
		return null;
	}
};
