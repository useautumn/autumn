import {
	CusProductStatus,
	cusProductsToCusEnts,
	customerEntitlements,
	type FullCustomer,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { redis, waitForRedisReady } from "@/external/redis/initRedis.js";
import { CusService } from "@/internal/customers/CusService.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

const getRoutedRedisForCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<Redis> => {
	const { ctx: routedCtx } = getCtxWithCustomerRedis({ ctx, customerId });
	await waitForRedisReady(routedCtx.redisV2, "customer-redis", 5000).catch(
		() => undefined,
	);
	return routedCtx.redisV2;
};

/**
 * Update next_reset_at for a specific cusEnt in the Redis FullCustomer cache.
 * Reads the cached blob, finds the cusEnt by ID, then uses JSON.SET on the exact path.
 */
export const setCachedCusEntField = async ({
	orgId,
	env,
	customerId,
	cusEntId,
	field,
	value,
}: {
	orgId: string;
	env: string;
	customerId: string;
	cusEntId: string;
	field: string;
	value: number | string | null;
}): Promise<void> => {
	const cacheKey = buildFullCustomerCacheKey({ orgId, env, customerId });

	const raw = (await redis.call("JSON.GET", cacheKey)) as string | null;
	if (!raw) return;

	const fullCustomer = JSON.parse(raw) as FullCustomer;
	const serializedValue = value === null ? "null" : JSON.stringify(value);

	for (let cpIdx = 0; cpIdx < fullCustomer.customer_products.length; cpIdx++) {
		const cusEnts = fullCustomer.customer_products[cpIdx].customer_entitlements;
		for (let ceIdx = 0; ceIdx < cusEnts.length; ceIdx++) {
			if (cusEnts[ceIdx].id === cusEntId) {
				await redis.call(
					"JSON.SET",
					cacheKey,
					`$.customer_products[${cpIdx}].customer_entitlements[${ceIdx}].${field}`,
					serializedValue,
				);
				return;
			}
		}
	}

	const extras = fullCustomer.extra_customer_entitlements || [];
	for (let eIdx = 0; eIdx < extras.length; eIdx++) {
		if (extras[eIdx].id === cusEntId) {
			await redis.call(
				"JSON.SET",
				cacheKey,
				`$.extra_customer_entitlements[${eIdx}].${field}`,
				serializedValue,
			);
			return;
		}
	}
};

/** Patch next_reset_at on a SubjectBalance in the V2 shared balance hash. */
export const setCachedSubjectBalanceField = async ({
	ctx,
	orgId,
	env,
	customerId,
	featureId,
	customerEntitlementId,
	field,
	value,
	redisV2,
}: {
	ctx?: TestContext;
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
	customerEntitlementId: string;
	field: string;
	value: number | string | null;
	redisV2?: Redis;
}): Promise<void> => {
	const targetRedisV2 =
		redisV2 ??
		(ctx ? await getRoutedRedisForCustomer({ ctx, customerId }) : null);
	if (!targetRedisV2) {
		throw new Error("setCachedSubjectBalanceField requires redisV2 or ctx");
	}

	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId,
		env,
		customerId,
		featureId,
	});

	const raw = await targetRedisV2.hget(balanceKey, customerEntitlementId);
	if (!raw) return;

	const subjectBalance = JSON.parse(raw);
	subjectBalance[field] = value;
	await targetRedisV2.hset(
		balanceKey,
		customerEntitlementId,
		JSON.stringify(subjectBalance),
	);
};

/**
 * Expire a cusEnt's next_reset_at in Postgres and both Redis caches
 * (legacy FullCustomer + V2 subject balance hash),
 * so the next read triggers a lazy reset. Returns the cusEnt for assertions.
 */
export const expireCusEntForReset = async ({
	ctx,
	customerId,
	featureId,
	pastTimeMs,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	pastTimeMs?: number;
}) => {
	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId,
	});

	if (!cusEnt) {
		throw new Error(
			`cusEnt not found for customer=${customerId} feature=${featureId}`,
		);
	}

	const pastTime = pastTimeMs ?? Date.now() - 1000;
	const routedRedisV2 = await getRoutedRedisForCustomer({ ctx, customerId });

	// Update Postgres
	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: pastTime })
		.where(eq(customerEntitlements.id, cusEnt.id));

	// Update legacy FullCustomer Redis cache
	await setCachedCusEntField({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		cusEntId: cusEnt.id,
		field: "next_reset_at",
		value: pastTime,
	});

	// Update V2 subject balance hash
	await setCachedSubjectBalanceField({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
		customerEntitlementId: cusEnt.id,
		field: "next_reset_at",
		value: pastTime,
		redisV2: routedRedisV2,
	});

	return cusEnt;
};

/**
 * Expire ALL cusEnts for a given feature in Postgres and both Redis caches.
 * Use this for entity-level features where multiple cusEnts share the same feature_id.
 */
export const expireAllCusEntsForReset = async ({
	ctx,
	customerId,
	featureId,
	pastTimeMs,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	pastTimeMs?: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	// cusProductsToCusEnts skips the entity scoping filter — "ALL" here
	// includes entity-scoped products' entitlements.
	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCustomer.customer_products,
		featureIds: [featureId],
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});

	if (cusEnts.length === 0) {
		throw new Error(
			`No cusEnts found for customer=${customerId} feature=${featureId}`,
		);
	}

	const pastTime = pastTimeMs ?? Date.now() - 1000;
	const routedRedisV2 = await getRoutedRedisForCustomer({ ctx, customerId });

	for (const cusEnt of cusEnts) {
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: pastTime })
			.where(eq(customerEntitlements.id, cusEnt.id));

		await setCachedCusEntField({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			cusEntId: cusEnt.id,
			field: "next_reset_at",
			value: pastTime,
		});

		await setCachedSubjectBalanceField({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId,
			customerEntitlementId: cusEnt.id,
			field: "next_reset_at",
			value: pastTime,
			redisV2: routedRedisV2,
		});
	}

	return cusEnts;
};
