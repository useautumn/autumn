import { sql } from "drizzle-orm";

export const customerPriceIdsSql = sql`ARRAY(
	SELECT product_price.id
	FROM customer_prices AS product_price
	WHERE product_price.customer_product_id = cp.id
	ORDER BY product_price.id
)`;
