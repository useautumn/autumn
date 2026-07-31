import {
	CusProductStatus,
	customerLicenses,
	customerProducts,
	products,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
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
 * License rows are already scoped to active customer-level parents by the query.
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
 * Cell membership rules live here only: strictly `active` status, customer-level
 * (no entity), seats excluded. Cancel-at-period-end rows stay active so they count.
 */
export const getCustomerExportPlanRows = async ({
	db,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
}): Promise<CustomerExportPlanRow[]> => {
	if (internalCustomerIds.length === 0) return [];

	const idList = sql.join(
		internalCustomerIds.map((id) => sql`${id}`),
		sql`, `,
	);

	return (await db.execute(sql`
		SELECT ${customerProducts.internal_customer_id} AS internal_customer_id,
		       ${products.id} AS product_id,
		       ${customerProducts.internal_product_id} AS internal_product_id,
		       false AS is_license
		FROM ${customerProducts}
		JOIN ${products} ON ${products.internal_id} = ${customerProducts.internal_product_id}
		WHERE ${customerProducts.internal_customer_id} IN (${idList})
		  AND ${customerProducts.status} = ${CusProductStatus.Active}
		  AND ${customerProducts.internal_entity_id} IS NULL
		  AND ${customerProducts.customer_license_link_id} IS NULL
		UNION ALL
		SELECT ${customerLicenses.internal_customer_id} AS internal_customer_id,
		       license_product.id AS product_id,
		       ${customerLicenses.license_internal_product_id} AS internal_product_id,
		       true AS is_license
		FROM ${customerLicenses}
		JOIN ${customerProducts} parent_product ON parent_product.id = ${customerLicenses.parent_customer_product_id}
		JOIN ${products} license_product ON license_product.internal_id = ${customerLicenses.license_internal_product_id}
		WHERE ${customerLicenses.internal_customer_id} IN (${idList})
		  AND parent_product.status = ${CusProductStatus.Active}
		  AND parent_product.internal_entity_id IS NULL
		${planetScaleTag({ query: "getCustomerExportPlanRows" })}
	`)) as unknown as CustomerExportPlanRow[];
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
