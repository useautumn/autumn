import {
	customerEntitlements,
	type PooledBalanceResetMode,
} from "@autumn/shared";
import { setCachedSubjectBalanceField } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { getPooledBalanceDbState } from "./getPooledBalanceDbState.js";

export const expirePooledBalanceForReset = async ({
	ctx,
	customerId,
	resetMode,
	pastTimeMs = Date.now() - 1_000,
}: {
	ctx: TestContext;
	customerId: string;
	resetMode: PooledBalanceResetMode;
	pastTimeMs?: number;
}) => {
	const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
	const pool = state.pools.find(
		(candidate) => candidate.reset_mode === resetMode,
	);
	if (!pool) {
		throw new Error(
			`Expected a '${resetMode}' pooled balance for customer '${customerId}'`,
		);
	}

	const pooledCustomerEntitlement = state.poolCustomerEntitlements.find(
		(candidate) => candidate.id === pool.customer_entitlement_id,
	);
	if (!pooledCustomerEntitlement) {
		throw new Error(
			`Expected synthetic customer entitlement '${pool.customer_entitlement_id}'`,
		);
	}
	const feature = ctx.features.find(
		(candidate) => candidate.internal_id === pool.internal_feature_id,
	);
	if (!feature) {
		throw new Error(
			`Expected feature '${pool.internal_feature_id}' for pooled balance '${pool.id}'`,
		);
	}

	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: pastTimeMs })
		.where(eq(customerEntitlements.id, pooledCustomerEntitlement.id));

	await setCachedSubjectBalanceField({
		ctx,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId: feature.id,
		customerEntitlementId: pooledCustomerEntitlement.id,
		field: "next_reset_at",
		value: pastTimeMs,
	});

	return { pool, pooledCustomerEntitlement, pastTimeMs };
};
