import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { definePreparedRowQuery } from "../../common/prepared/definePreparedRowQuery.js";
import { customerProducts } from "../../common/schema/customerProducts.js";
import { products } from "../../common/schema/products.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";
import type { CustomerProductRow } from "../types/customerProductRow.js";

// Prices are not mirrored, so no prepaid option can move a starting balance and
// every entitlement of the product reads as price-free.
const NO_CUSTOMER_PRICES: FullCusProduct["customer_prices"] = [];
const NO_CUSTOMER_ENTITLEMENTS: FullCusProduct["customer_entitlements"] = [];

const listRows = definePreparedRowQuery<CustomerProductRow>({
	projection: {
		id: customerProducts.id,
		internal_customer_id: customerProducts.internal_customer_id,
		internal_product_id: customerProducts.internal_product_id,
		internal_entity_id: customerProducts.internal_entity_id,
		entity_id: customerProducts.entity_id,
		customer_id: customerProducts.customer_id,
		// products.id: the mirror normalises the customer product's copy to match.
		product_id: products.id,
		created_at: customerProducts.created_at,
		updated_at: customerProducts.updated_at,
		starts_at: customerProducts.starts_at,
		status: customerProducts.status,
		canceled: customerProducts.canceled,
		collection_method: customerProducts.collection_method,
		options: customerProducts.options,
		quantity: customerProducts.quantity,
		is_custom: customerProducts.is_custom,
		api_semver: customerProducts.api_semver,
		external_id: customerProducts.external_id,
		billing_version: customerProducts.billing_version,
		"product.internal_id": products.internal_id,
		"product.id": products.id,
		"product.name": products.name,
		"product.description": products.description,
		"product.org_id": products.org_id,
		"product.created_at": products.created_at,
		"product.env": products.env,
		"product.is_add_on": products.is_add_on,
		"product.is_default": products.is_default,
		"product.group": products.group,
		"product.version": products.version,
		"product.version_slug": products.version_slug,
		"product.active": products.active,
		"product.base_variant_id": products.base_variant_id,
		"product.archived": products.archived,
		"product.config": products.config,
		"product.metadata": products.metadata,
	},
	build: ({ db, projection }) =>
		db
			.select(projection)
			.from(customerProducts)
			.innerJoin(
				products,
				eq(customerProducts.internal_product_id, products.internal_id),
			)
			.where(
				and(
					eq(
						customerProducts.internal_customer_id,
						sql.placeholder("internalCustomerId"),
					),
					eq(customerProducts.status, CusProductStatus.Active),
				),
			)
			.prepare(),
});

export const listActiveByInternalCustomerId = ({
	ctx,
	internalCustomerId,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
}): FullCusProduct[] =>
	listRows({ ctx, placeholderValues: { internalCustomerId } }).map((row) => ({
		...row,
		customer_prices: NO_CUSTOMER_PRICES,
		customer_entitlements: NO_CUSTOMER_ENTITLEMENTS,
	}));
