import {
	customerLicenses,
	customerPrices,
	customerProducts,
	licensePrices,
	planLicenses,
	prices,
} from "@autumn/shared";
import { and, eq, isNotNull, notExists, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * SQL predicate: the customer product has nothing that bills it, so Autumn owns
 * its trial expiry. Mirrors `customerProductToEffectivePrices` plus Stripe ownership.
 */
export const hasNoBillingSource = ({ db }: { db: DrizzleCli }) => {
	const hasNoStripeSubscription = sql`coalesce(array_length(${customerProducts.subscription_ids}, 1), 0) = 0`;

	const hasNoCustomerPrice = notExists(
		db
			.select({ id: customerPrices.id })
			.from(customerPrices)
			.where(eq(customerPrices.customer_product_id, customerProducts.id)),
	);

	// customer_products.id is COLLATE "C"; matching the license column's collation
	// keeps this lookup on unique_customer_license instead of a seq scan.
	const parentCustomerProductId = sql`${customerProducts.id} COLLATE "default"`;
	const hasNoPricedLicense = notExists(
		db
			.select({ id: customerLicenses.id })
			.from(customerLicenses)
			.innerJoin(
				planLicenses,
				eq(planLicenses.id, customerLicenses.plan_license_id),
			)
			.leftJoin(
				licensePrices,
				and(
					eq(planLicenses.customized, true),
					eq(licensePrices.plan_license_id, planLicenses.id),
				),
			)
			.leftJoin(
				prices,
				and(
					eq(planLicenses.customized, false),
					eq(
						prices.internal_product_id,
						customerLicenses.license_internal_product_id,
					),
					eq(prices.is_custom, false),
				),
			)
			.where(
				and(
					eq(
						customerLicenses.parent_customer_product_id,
						parentCustomerProductId,
					),
					or(isNotNull(licensePrices.id), isNotNull(prices.id)),
				),
			),
	);

	return and(hasNoStripeSubscription, hasNoCustomerPrice, hasNoPricedLicense);
};
