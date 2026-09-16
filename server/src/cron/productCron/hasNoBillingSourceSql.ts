import {
	customerLicenses,
	customerPrices,
	customerProducts,
	licensePrices,
	planLicenses,
	prices,
} from "@autumn/shared";
import { and, eq, exists, notExists, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

/**
 * SQL predicate: the customer product has nothing that bills it, so Autumn owns
 * its trial expiry. Mirrors `customerProductToEffectivePrices` plus Stripe ownership.
 */
export const hasNoBillingSource = ({ db }: { db: DrizzleCli }) => {
	const hasNoStripeSubscription = sql`coalesce(array_length(${customerProducts.subscription_ids}, 1), 0) = 0`;

	const hasNoCustomerPrice = notExists(
		db
			.select()
			.from(customerPrices)
			.where(eq(customerPrices.customer_product_id, customerProducts.id)),
	);

	const customizedLicenseHasPrice = exists(
		db
			.select()
			.from(licensePrices)
			.where(eq(licensePrices.plan_license_id, planLicenses.id)),
	);
	const baseLicenseProductHasPrice = exists(
		db
			.select()
			.from(prices)
			.where(
				and(
					eq(
						prices.internal_product_id,
						customerLicenses.license_internal_product_id,
					),
					eq(prices.is_custom, false),
				),
			),
	);
	const hasNoPricedLicense = notExists(
		db
			.select()
			.from(customerLicenses)
			.innerJoin(
				planLicenses,
				eq(planLicenses.id, customerLicenses.plan_license_id),
			)
			.where(
				and(
					eq(customerLicenses.parent_customer_product_id, customerProducts.id),
					or(
						and(eq(planLicenses.customized, true), customizedLicenseHasPrice),
						and(eq(planLicenses.customized, false), baseLicenseProductHasPrice),
					),
				),
			),
	);

	return and(hasNoStripeSubscription, hasNoCustomerPrice, hasNoPricedLicense);
};
