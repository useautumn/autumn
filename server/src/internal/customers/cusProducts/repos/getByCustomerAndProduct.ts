import {
	type AppEnv,
	customerProducts,
	type FullCusProduct,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";

/** Finds customer products by internal customer + internal product IDs. */
export const getByCustomerAndProduct = async ({
	db,
	internalCustomerId,
	internalProductId,
	orgId,
	env,
	inStatuses,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	internalProductId: string;
	orgId: string;
	env: AppEnv;
	inStatuses?: string[];
}): Promise<FullCusProduct[]> => {
	const data = await db.query.customerProducts.findMany({
		where: (_table, { and: dAnd, eq: dEq, inArray: dInArray }) =>
			dAnd(
				dEq(customerProducts.internal_customer_id, internalCustomerId),
				dEq(customerProducts.internal_product_id, internalProductId),
				inStatuses ? dInArray(customerProducts.status, inStatuses) : undefined,
			),
		with: {
			product: true,
			customer: true,
			customer_entitlements: {
				with: {
					entitlement: {
						with: {
							feature: true,
						},
					},
					replaceables: true,
					rollovers: true,
				},
			},
			customer_prices: {
				with: {
					price: true,
				},
			},
			free_trial: true,
		},
	});

	const cusProducts = data as FullCusProduct[];

	return cusProducts.filter((cusProduct) => {
		if (!cusProduct.product) return false;
		const product = cusProduct.product;

		if (product.org_id !== orgId || product.env !== env) {
			return false;
		}

		return true;
	});
};
