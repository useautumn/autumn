import {
	type ByocCacheEntry,
	customerToCacheEntry,
	entityToCacheEntry,
} from "@autumn/byoc";
import {
	ApiVersion,
	ApiVersionClass,
	type FullSubject,
	fullSubjectToApiCustomerV5,
	fullSubjectToApiEntityV2,
} from "@autumn/shared";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheReadyOrg } from "../types/cacheReadyOrg.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";

/** BYOC_CACHE_API_VERSION as the enum; the byoc tests pin the two together. */
const CACHE_API_VERSION = new ApiVersionClass(ApiVersion.V2_4);

/** The subject exactly as customers.get / entities.get return it, keyed and stamped with the offset that moved it. */
export const fullSubjectToCacheEntry = async ({
	ctx,
	cacheSubject,
	fullSubject,
	cacheOrg,
}: {
	ctx: Pick<CachePushContext, "logger">;
	cacheSubject: CacheSubjectRef;
	fullSubject: FullSubject;
	cacheOrg: CacheReadyOrg;
}): Promise<{ key: string; entry: ByocCacheEntry }> => {
	const { org, env, features } = cacheOrg;
	const renderCtx = { org, env, features, logger: ctx.logger, expand: [] };
	const { identity, logOffset } = cacheSubject;
	const { customerId, entityId } = identity;
	const stamp = { logOffset, computedAt: Date.now() };

	if (entityId) {
		const { apiEntity } = await fullSubjectToApiEntityV2({
			ctx: renderCtx,
			fullSubject,
		});
		return entityToCacheEntry({
			customerId,
			entityId,
			entity: apiEntity,
			...stamp,
		});
	}
	const { apiCustomer } = await fullSubjectToApiCustomerV5({
		ctx: renderCtx,
		fullSubject,
		apiVersion: CACHE_API_VERSION,
	});
	return customerToCacheEntry({ customerId, customer: apiCustomer, ...stamp });
};
