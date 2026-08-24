import { BillingVersion, CollectionMethod } from "@autumn/shared";
import type { customerProducts } from "../../../sqlite/common/schema/customerProducts.js";

type CustomerProductRow = typeof customerProducts.$inferInsert;

export type NormalizedCustomerProductRow = CustomerProductRow & {
	product_id: string;
	created_at: number;
	starts_at: number;
	canceled: boolean;
	quantity: number;
	// Enum text columns stay text in the mirror; the read declares their type.
	collection_method: string;
	billing_version: string;
};

export const normalizeCustomerProductRow = ({
	row,
	productIdByInternalId,
}: {
	row: CustomerProductRow;
	productIdByInternalId: Map<string, string>;
}): NormalizedCustomerProductRow => ({
	...row,
	product_id:
		row.product_id ?? productIdByInternalId.get(row.internal_product_id) ?? "",
	created_at: row.created_at ?? 0,
	starts_at: row.starts_at ?? 0,
	canceled: row.canceled ?? false,
	quantity: row.quantity ?? 1,
	options: row.options ?? [],
	collection_method:
		row.collection_method ?? CollectionMethod.ChargeAutomatically,
	billing_version: row.billing_version ?? BillingVersion.V1,
});
