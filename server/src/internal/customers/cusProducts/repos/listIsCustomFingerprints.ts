import { customerProducts, MIGRATABLE_STATUSES } from "@autumn/shared";
import { and, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isCustomFingerprintSql } from "./isCustomFingerprint.js";

export type IsCustomFingerprintRow = {
	id: string;
	internalCustomerId: string;
	customerId: string | null;
	isCustom: boolean;
	fingerprint: string;
};

export const listIsCustomFingerprints = async ({
	db,
	internalCustomerIds,
	internalProductIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	internalProductIds: string[];
}): Promise<IsCustomFingerprintRow[]> => {
	if (internalCustomerIds.length === 0 || internalProductIds.length === 0) {
		return [];
	}

	return db
		.select({
			id: customerProducts.id,
			internalCustomerId: customerProducts.internal_customer_id,
			customerId: customerProducts.customer_id,
			isCustom: customerProducts.is_custom,
			fingerprint: isCustomFingerprintSql,
		})
		.from(customerProducts)
		.where(
			and(
				inArray(customerProducts.internal_customer_id, internalCustomerIds),
				inArray(customerProducts.internal_product_id, internalProductIds),
				inArray(customerProducts.status, [...MIGRATABLE_STATUSES]),
			),
		);
};
