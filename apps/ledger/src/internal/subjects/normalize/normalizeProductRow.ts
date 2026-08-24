import type { products } from "../../../sqlite/common/schema/products.js";

type ProductRow = typeof products.$inferInsert;

export type NormalizedProductRow = ProductRow & {
	name: string;
	group: string;
};

export const normalizeProductRow = ({
	row,
}: {
	row: ProductRow;
}): NormalizedProductRow => ({
	...row,
	name: row.name ?? row.id,
	group: row.group ?? "",
});
