import { type SQL, sql } from "drizzle-orm";

/** A customer_price marks a paid customization that the free catalog
 * definition and entsAreSame cannot see. */
export const rowIsUnpaidSql = ({
	customerProductId,
	entitlementId,
}: {
	customerProductId: SQL;
	entitlementId: SQL;
}): SQL => sql`NOT EXISTS (
	SELECT 1
	FROM customer_prices AS attached_price
	INNER JOIN prices AS attached_price_definition
		ON attached_price_definition.id = attached_price.price_id
	WHERE attached_price.customer_product_id = ${customerProductId}
		AND attached_price_definition.entitlement_id = ${entitlementId}
)`;
