import {
	CusProductStatus,
	customerLicenses,
	customerProducts,
	products,
} from "@autumn/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias, unionAll } from "drizzle-orm/pg-core";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { OneOffProductLookup } from "./getOneOffProductLookup.js";

export type CustomerExportPlanRow = {
	internal_customer_id: string;
	product_id: string | null;
	internal_product_id: string;
	is_license: boolean;
};

export type CustomerExportPlanColumns = {
	subscriptions: string[];
	purchases: string[];
	licenses: string[];
};

export const emptyPlanColumns = (): CustomerExportPlanColumns => ({
	subscriptions: [],
	purchases: [],
	licenses: [],
});

const sortedUnique = (values: string[]) =>
	[...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Recurring and free plans are subscriptions; one-off plans are purchases.
 * License rows are already scoped to live customer-level parents by the query.
 */
export const bucketCustomerExportPlanRows = ({
	rows,
	oneOffInternalProductIds,
}: {
	rows: CustomerExportPlanRow[];
	oneOffInternalProductIds: Set<string>;
}): Map<string, CustomerExportPlanColumns> => {
	const byCustomer = new Map<string, CustomerExportPlanColumns>();

	for (const row of rows) {
		if (!row.product_id) continue;

		const columns =
			byCustomer.get(row.internal_customer_id) ?? emptyPlanColumns();

		if (row.is_license) {
			columns.licenses.push(row.product_id);
		} else if (oneOffInternalProductIds.has(row.internal_product_id)) {
			columns.purchases.push(row.product_id);
		} else {
			columns.subscriptions.push(row.product_id);
		}

		byCustomer.set(row.internal_customer_id, columns);
	}

	for (const columns of byCustomer.values()) {
		columns.subscriptions = sortedUnique(columns.subscriptions);
		columns.purchases = sortedUnique(columns.purchases);
		columns.licenses = sortedUnique(columns.licenses);
	}

	return byCustomer;
};

/**
 * Cell membership rules live here only: live (`active`/`past_due`) status as in
 * the dashboard list, customer-level (no entity), seats excluded.
 */
export const getCustomerExportPlanRows = async ({
	db,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
}): Promise<CustomerExportPlanRow[]> => {
	if (internalCustomerIds.length === 0) return [];

	const liveStatuses = [CusProductStatus.Active, CusProductStatus.PastDue];
	const parentProducts = alias(customerProducts, "parent_product");
	const licenseProducts = alias(products, "license_product");
	const productRows = db
		.select({
			internal_customer_id: customerProducts.internal_customer_id,
			product_id: products.id,
			internal_product_id: customerProducts.internal_product_id,
			is_license: sql<boolean>`false`.as("is_license"),
		})
		.from(customerProducts)
		.innerJoin(
			products,
			eq(products.internal_id, customerProducts.internal_product_id),
		)
		.where(
			and(
				inArray(customerProducts.internal_customer_id, internalCustomerIds),
				inArray(customerProducts.status, liveStatuses),
				isNull(customerProducts.internal_entity_id),
				isNull(customerProducts.customer_license_link_id),
			),
		);
	const licenseRows = db
		.select({
			internal_customer_id: customerLicenses.internal_customer_id,
			product_id: licenseProducts.id,
			internal_product_id: customerLicenses.license_internal_product_id,
			is_license: sql<boolean>`true`.as("is_license"),
		})
		.from(customerLicenses)
		.innerJoin(
			parentProducts,
			eq(parentProducts.id, customerLicenses.parent_customer_product_id),
		)
		.innerJoin(
			licenseProducts,
			eq(
				licenseProducts.internal_id,
				customerLicenses.license_internal_product_id,
			),
		)
		.where(
			and(
				inArray(customerLicenses.internal_customer_id, internalCustomerIds),
				inArray(parentProducts.status, liveStatuses),
				isNull(parentProducts.internal_entity_id),
				sql`true ${planetScaleTag({ query: "getCustomerExportPlanRows" })}`,
			),
		);

	return await unionAll(productRows, licenseRows);
};

export const getCustomerExportPlanColumns = async ({
	db,
	internalCustomerIds,
	oneOffProductLookup,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	oneOffProductLookup: OneOffProductLookup;
}) => {
	const rows = await getCustomerExportPlanRows({ db, internalCustomerIds });

	const internalProductIds = [
		...new Set(
			rows
				.filter((row) => !row.is_license)
				.map((row) => row.internal_product_id),
		),
	];
	const oneOffInternalProductIds =
		await oneOffProductLookup.resolveOneOffInternalProductIds({
			internalProductIds,
		});

	return bucketCustomerExportPlanRows({ rows, oneOffInternalProductIds });
};
