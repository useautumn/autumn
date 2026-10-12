import { customerProducts } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isCustomFingerprintSql } from "./isCustomFingerprint.js";

/** Compare-and-set on the flag and the fingerprint, so a row changed since it was read is left alone. */
export const flipCustomerProductsIsCustom = async ({
	db,
	customerProductIds,
	fingerprints,
	to,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
	fingerprints: string[];
	to: boolean;
}) => {
	if (customerProductIds.length === 0) return [];

	return db
		.update(customerProducts)
		.set({ is_custom: to, updated_at: Date.now() })
		.where(
			and(
				inArray(customerProducts.id, customerProductIds),
				eq(customerProducts.is_custom, !to),
				inArray(isCustomFingerprintSql, fingerprints),
			),
		)
		.returning({
			id: customerProducts.id,
			internalCustomerId: customerProducts.internal_customer_id,
			customerId: customerProducts.customer_id,
		});
};
