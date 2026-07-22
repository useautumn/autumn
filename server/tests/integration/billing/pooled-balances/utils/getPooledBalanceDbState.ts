import {
	customerEntitlements,
	customerProducts,
	customers,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getPooledBalanceDbState = async ({
	db,
	customerId,
}: {
	db: DrizzleCli;
	customerId: string;
}) => {
	const customer = await db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!customer) throw new Error(`Customer '${customerId}' not found`);

	const [pools, sourceCustomerProducts] = await Promise.all([
		db.query.pooledBalances.findMany({
			where: eq(pooledBalances.internal_customer_id, customer.internal_id),
		}),
		db.query.customerProducts.findMany({
			where: eq(customerProducts.internal_customer_id, customer.internal_id),
			with: {
				customer_entitlements: { with: { entitlement: true } },
			},
		}),
	]);

	const poolCustomerEntitlements = pools.length
		? await db.query.customerEntitlements.findMany({
				where: inArray(
					customerEntitlements.id,
					pools.map((pool) => pool.customer_entitlement_id),
				),
				with: { rollovers: true },
			})
		: [];
	const contributions = pools.length
		? await db.query.pooledBalanceContributions.findMany({
				where: inArray(
					pooledBalanceContributions.pooled_balance_id,
					pools.map((pool) => pool.id),
				),
			})
		: [];

	return {
		contributions,
		poolCustomerEntitlements,
		pools,
		sourceCustomerProducts,
	};
};

export type PooledBalanceDbState = Awaited<
	ReturnType<typeof getPooledBalanceDbState>
>;

export const getPooledSourceCustomerProduct = ({
	state,
	productId,
	entityId,
}: {
	state: PooledBalanceDbState;
	productId: string;
	entityId: string;
}) => {
	const customerProduct = state.sourceCustomerProducts.find(
		(candidate) =>
			candidate.product_id === productId && candidate.entity_id === entityId,
	);

	if (!customerProduct) {
		throw new Error(
			`Pooled source customer product '${productId}' was not found for entity '${entityId}'.`,
		);
	}

	return customerProduct;
};
