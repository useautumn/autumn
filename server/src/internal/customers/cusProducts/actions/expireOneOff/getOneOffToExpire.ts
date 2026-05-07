import { BillingInterval, CusProductStatus } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import type { OneOffCustomerProductResult } from "../oneOffCustomerProductResult.js";

/**
 * Fetches active one-off customer products whose explicit access window has ended.
 */
export const getOneOffCustomerProductsToExpire = async ({
	ctx,
	nowMs = Date.now(),
}: {
	ctx: CronContext;
	nowMs?: number;
}): Promise<OneOffCustomerProductResult[]> => {
	const result = await ctx.db.execute<OneOffCustomerProductResult>(`
		WITH
		active_cus_products_with_prices AS (
			SELECT DISTINCT cp.id
			FROM customer_products cp
			WHERE cp.status IN ('${CusProductStatus.Active}', '${CusProductStatus.PastDue}')
			  AND cp.ended_at IS NOT NULL
			  AND cp.ended_at <= ${nowMs}
			  AND EXISTS (
				SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id
			  )
		),
		cus_products_with_non_one_off_prices AS (
			SELECT DISTINCT cpr.customer_product_id
			FROM customer_prices cpr
			INNER JOIN prices p ON p.id = cpr.price_id
			WHERE cpr.customer_product_id IN (SELECT id FROM active_cus_products_with_prices)
			  AND COALESCE(p.config->>'interval', '') != '${BillingInterval.OneOff}'
		),
		one_off_cus_products AS (
			SELECT id FROM active_cus_products_with_prices
			WHERE id NOT IN (SELECT customer_product_id FROM cus_products_with_non_one_off_prices)
		)
		SELECT
			row_to_json(cp.*) as customer_product,
			row_to_json(cpr.*) as customer_price,
			row_to_json(p.*) as price,
			row_to_json(c.*) as customer,
			row_to_json(prod.*) as product,
			row_to_json(o.*) as org
		FROM customer_products cp
		INNER JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
		INNER JOIN prices p ON p.id = cpr.price_id
		INNER JOIN customers c ON c.internal_id = cp.internal_customer_id
		INNER JOIN products prod ON prod.internal_id = cp.internal_product_id
		INNER JOIN organizations o ON o.id = c.org_id
		WHERE cp.id IN (SELECT id FROM one_off_cus_products)
	`);

	return result as OneOffCustomerProductResult[];
};
