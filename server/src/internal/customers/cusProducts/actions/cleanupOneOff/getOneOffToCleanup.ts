import {
	AllowanceType,
	BillingInterval,
	CusProductStatus,
	type Customer,
	type CustomerPrice,
	type CustomerProduct,
	FeatureType,
	FeatureUsageType,
	type Organization,
	type Price,
	type Product,
} from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext";

export type OneOffCleanupResult = {
	customer_product: CustomerProduct;
	customer_price: CustomerPrice;
	price: Price;
	customer: Customer;
	product: Product;
	org: Organization;
};

/**
 * Fetches one-off customer products eligible for cleanup.
 *
 * A customer product is eligible when:
 * 1. Status is Active or PastDue
 * 2. All its prices are one_off interval
 * 3. All its entitlements are either:
 *    - Boolean features, OR
 *    - Single-use consumables with balance=0 and usage_allowed=false
 * 4. A newer active customer product exists for the same product
 */
export const getOneOffCustomerProductsToCleanup = async ({
	ctx,
}: {
	ctx: CronContext;
}): Promise<OneOffCleanupResult[]> => {
	const result = await ctx.db.execute<{
		customer_product: CustomerProduct;
		customer_price: CustomerPrice;
		price: Price;
		customer: Customer;
		product: Product;
		org: Organization;
	}>(`
		WITH 
		-- CTE 1: Active customer products with at least one price
		active_cus_products_with_prices AS (
			SELECT DISTINCT cp.id
			FROM customer_products cp
			WHERE cp.status IN ('${CusProductStatus.Active}', '${CusProductStatus.PastDue}')
			  AND EXISTS (
				SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id
			)
		),
		
		-- CTE 2: Exclude customer products that have ANY price that is NOT one_off
		cus_products_with_non_one_off_prices AS (
			SELECT DISTINCT cpr.customer_product_id
			FROM customer_prices cpr
			INNER JOIN prices p ON p.id = cpr.price_id
			WHERE cpr.customer_product_id IN (SELECT id FROM active_cus_products_with_prices)
			  AND COALESCE(p.config->>'interval', '') != '${BillingInterval.OneOff}'
		),
		
		-- CTE 3: One-off customer products (has prices AND all prices are one_off)
		one_off_cus_products AS (
			SELECT id FROM active_cus_products_with_prices
			WHERE id NOT IN (SELECT customer_product_id FROM cus_products_with_non_one_off_prices)
		),
		
		-- CTE 4: From one-off products, filter to those with at least one entitlement
		cus_products_with_entitlements AS (
			SELECT DISTINCT cp.id
			FROM customer_products cp
			WHERE cp.id IN (SELECT id FROM one_off_cus_products)
			  AND EXISTS (
				SELECT 1 FROM customer_entitlements ce WHERE ce.customer_product_id = cp.id
			)
		),
		
		-- CTE 5: Valid one-off customer products where ALL entitlements meet criteria
		-- Every entitlement must be either:
		--   A. Boolean feature, OR
		--   B. Single-use consumable (usage_type = single_use AND allowance_type = fixed AND balance = 0 AND usage_allowed = false)
		valid_one_off_cus_products AS (
			SELECT cp.id, cp.internal_customer_id, cp.internal_entity_id, cp.created_at, cp.internal_product_id
			FROM customer_products cp
			WHERE cp.id IN (SELECT id FROM cus_products_with_entitlements)
			  -- Exclude if ANY entitlement does NOT match criteria A or B
			  AND NOT EXISTS (
			  	SELECT 1
			  	FROM customer_entitlements ce
			  	INNER JOIN entitlements e ON e.id = ce.entitlement_id
			  	INNER JOIN features f ON f.internal_id = e.internal_feature_id
			  	WHERE ce.customer_product_id = cp.id
			  	  -- Entitlement does NOT satisfy A (boolean) AND does NOT satisfy B (single_use consumable)
			  	  AND f.type != '${FeatureType.Boolean}'
			  	  AND NOT (
			  	  	-- B: Single-use consumable with all conditions met
			  	  	COALESCE(f.config->>'usage_type', '') = '${FeatureUsageType.Single}'
			  	  	AND COALESCE(e.allowance_type, '') = '${AllowanceType.Fixed}'
			  	  	AND COALESCE(ce.balance, 0) = 0
			  	  	AND ce.usage_allowed = false
			  	  )
			  )
		),
		
		-- CTE 6: Customer products that have a valid corresponding newer active product
		cus_products_with_newer_active_product AS (
			SELECT DISTINCT oo.id
			FROM valid_one_off_cus_products oo
			INNER JOIN products prod1 ON prod1.internal_id = oo.internal_product_id
			WHERE EXISTS (
				SELECT 1 
				FROM customer_products cp2
				INNER JOIN products prod2 ON prod2.internal_id = cp2.internal_product_id
				WHERE cp2.internal_customer_id = oo.internal_customer_id
				  AND (
				  	(cp2.internal_entity_id IS NULL AND oo.internal_entity_id IS NULL)
				  	OR cp2.internal_entity_id = oo.internal_entity_id
				  )
				  AND prod2.id = prod1.id
				  AND cp2.created_at > oo.created_at
				  AND cp2.status IN ('${CusProductStatus.Active}', '${CusProductStatus.PastDue}')
				  AND cp2.id != oo.id
				  -- Ensure all boolean features from original exist in newer product
				  AND NOT EXISTS (
				  	-- Find boolean features in original that don't exist in newer
				  	SELECT 1
				  	FROM customer_entitlements ce1
				  	INNER JOIN entitlements e1 ON e1.id = ce1.entitlement_id
				  	INNER JOIN features f1 ON f1.internal_id = e1.internal_feature_id
				  	WHERE ce1.customer_product_id = oo.id
				  	  AND f1.type = '${FeatureType.Boolean}'
				  	  AND NOT EXISTS (
				  	  	-- Check if newer product has this boolean feature
				  	  	SELECT 1
				  	  	FROM customer_entitlements ce2
				  	  	INNER JOIN entitlements e2 ON e2.id = ce2.entitlement_id
				  	  	INNER JOIN features f2 ON f2.internal_id = e2.internal_feature_id
				  	  	WHERE ce2.customer_product_id = cp2.id
				  	  	  AND f2.id = f1.id
				  	  	  AND f2.type = '${FeatureType.Boolean}'
				  	  )
				  )
			)
		)
		
		-- Final query: Get full data for customer products meeting all criteria
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
		WHERE cp.id IN (SELECT id FROM cus_products_with_newer_active_product)
	`);

	return result as OneOffCleanupResult[];
};
