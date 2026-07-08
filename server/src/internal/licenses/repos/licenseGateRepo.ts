import {
	customerLicenses,
	customerProducts,
	planLicenses,
} from "@autumn/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { licenseParentStatuses } from "../licenseUtils.js";
import { activeAssignmentConditions } from "./licenseAssignmentRepo.js";

/** Single-roundtrip union gate: does this customer touch licenses at all? */
const touchesLicenses = async ({
	db,
	internalCustomerId,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
}): Promise<boolean> => {
	const one = { one: sql<number>`1` };

	const parentWithCatalogLinks = db
		.select(one)
		.from(planLicenses)
		.innerJoin(
			customerProducts,
			eq(
				customerProducts.internal_product_id,
				planLicenses.parent_internal_product_id,
			),
		)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				isNull(customerProducts.internal_entity_id),
				inArray(customerProducts.status, licenseParentStatuses),
			),
		)
		.limit(1);

	const customerScopedLinks = db
		.select(one)
		.from(planLicenses)
		.innerJoin(
			customerProducts,
			eq(customerProducts.id, planLicenses.parent_customer_product_id),
		)
		.where(eq(customerProducts.internal_customer_id, internalCustomerId))
		.limit(1);

	const activeAssignments = db
		.select(one)
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				...activeAssignmentConditions(),
			),
		)
		.limit(1);

	const balances = db
		.select(one)
		.from(customerLicenses)
		.where(eq(customerLicenses.internal_customer_id, internalCustomerId))
		.limit(1);

	const rows = await unionAll(
		parentWithCatalogLinks,
		customerScopedLinks,
		activeAssignments,
		balances,
	).limit(1);

	return rows.length > 0;
};

export const licenseGateRepo = {
	touchesLicenses,
} as const;
