import type { InsertCustomerEntitlement } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";

import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { CusEntService } from "../CusEntitlementService.js";

/**
 * Updates a cusEnt in both Postgres and the Redis FullCustomer cache.
 */
export const updateCusEntDbAndCache = async ({
	ctx,
	customerId,
	cusEntId,
	updates,
	incrementCacheVersion = false,
}: {
	ctx: RepoContext;
	customerId: string;
	cusEntId: string;
	updates: Partial<InsertCustomerEntitlement>;
	incrementCacheVersion?: boolean;
}) => {
	await CusEntService.update({
		ctx,
		id: cusEntId,
		updates,
		incrementCacheVersion,
	});

	const cacheKey = buildFullCustomerCacheKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});

	const cacheUpdates = [
		{
			cus_ent_id: cusEntId,
			balance: updates.balance ?? null,
			additional_balance: updates.additional_balance ?? null,
			adjustment: updates.adjustment ?? null,
			entities: updates.entities ?? null,
			next_reset_at: updates.next_reset_at ?? null,
			expected_next_reset_at: null,
			rollover_insert: null,
			rollover_overwrites: null,
			rollover_delete_ids: null,
			new_replaceables: null,
			deleted_replaceable_ids: null,
		},
	];

	if (ctx.redis) {
		await tryRedisWrite(() =>
			ctx.redis!.updateCustomerEntitlements(
				cacheKey,
				JSON.stringify({ updates: cacheUpdates }),
			),
		);
	}
};
