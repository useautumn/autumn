import { customerEntitlements, type FullCustomer } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { redis } from "@/external/redis/initRedis.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

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

/**
 * Expire a cusEnt's next_reset_at in both Postgres and Redis cache,
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

	// Update Postgres
	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: pastTime })
		.where(eq(customerEntitlements.id, cusEnt.id));

	// Update Redis cache
	await setCachedCusEntField({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		cusEntId: cusEnt.id,
		field: "next_reset_at",
		value: pastTime,
	});

	return cusEnt;
};
