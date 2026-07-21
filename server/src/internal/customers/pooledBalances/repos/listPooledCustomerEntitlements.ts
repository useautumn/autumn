import {
	type FullCustomerEntitlement,
	InternalError,
	pooledBalances,
} from "@autumn/shared";
import { desc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

const POOLED_CUSTOMER_ENTITLEMENT_LIMIT = 100;

export const listPooledCustomerEntitlements = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
}): Promise<FullCustomerEntitlement[]> => {
	const rows = await db.query.pooledBalances.findMany({
		where: eq(pooledBalances.internal_customer_id, internalCustomerId),
		with: {
			customer_entitlement: {
				with: {
					entitlement: { with: { feature: true } },
					replaceables: true,
					rollovers: true,
				},
			},
		},
		orderBy: desc(pooledBalances.created_at),
		limit: POOLED_CUSTOMER_ENTITLEMENT_LIMIT,
	});

	return rows.map(({ customer_entitlement: customerEntitlement, ...pool }) => {
		if (!customerEntitlement?.entitlement) {
			throw new InternalError({
				message: `Pooled balance '${pool.id}' is missing its customer entitlement graph.`,
			});
		}

		return {
			...(customerEntitlement as FullCustomerEntitlement),
			pooled_balance: pool,
		};
	});
};
