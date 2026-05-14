import {
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	entitlements,
	prices,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { and, eq, inArray } from "drizzle-orm";

export const getPreparedCustomerRows = async ({
	ctx,
	customerIds,
	productId,
	productIds,
}: {
	ctx: AutumnContext;
	customerIds: string[];
	productId?: string;
	productIds?: string[];
}) => {
	const productIdsToMatch = productIds ?? (productId ? [productId] : []);
	if (productIdsToMatch.length === 0) {
		throw new Error(
			"getPreparedCustomerRows: productId or productIds required",
		);
	}

	return ctx.db
		.select({
			customerId: customers.id,
			customerProductId: customerProducts.id,
			customerProductInternalProductId: customerProducts.internal_product_id,
			customerProductProductId: customerProducts.product_id,
			customerProductEntityId: customerProducts.entity_id,
			priceId: customerPrices.price_id,
			priceInternalProductId: prices.internal_product_id,
			entitlementId: customerEntitlements.entitlement_id,
			entitlementInternalProductId: entitlements.internal_product_id,
		})
		.from(customers)
		.innerJoin(
			customerProducts,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.leftJoin(
			customerPrices,
			eq(customerPrices.customer_product_id, customerProducts.id),
		)
		.leftJoin(prices, eq(customerPrices.price_id, prices.id))
		.leftJoin(
			customerEntitlements,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.leftJoin(
			entitlements,
			eq(customerEntitlements.entitlement_id, entitlements.id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				inArray(customers.id, customerIds),
				inArray(customerProducts.product_id, productIdsToMatch),
			),
		);
};
