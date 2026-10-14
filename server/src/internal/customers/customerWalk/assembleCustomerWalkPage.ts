import { CustomerWalkCursor, type ListPage } from "@autumn/shared";

export type CustomerWalkRow = {
	internalCustomerId: string;
	createdAt: number;
	id: string;
};

export const assembleCustomerWalkPage = <TRow, TItem>({
	rows,
	limit,
	boundaryCustomerId,
	toWalkRow,
	toItem,
}: {
	rows: TRow[];
	limit: number;
	boundaryCustomerId: string | null;
	toWalkRow: (row: TRow) => CustomerWalkRow;
	toItem: (row: TRow) => TItem;
}): ListPage<TItem> => {
	const pageRows = rows.slice(0, limit);
	const list = pageRows.map(toItem);

	if (rows.length > limit) {
		const last = toWalkRow(pageRows[pageRows.length - 1]);
		return {
			list,
			has_more: true,
			next_cursor: CustomerWalkCursor.encode({
				c: last.internalCustomerId,
				t: last.createdAt,
				id: last.id,
			}),
		};
	}

	if (boundaryCustomerId) {
		return {
			list,
			has_more: true,
			next_cursor: CustomerWalkCursor.encode({
				c: boundaryCustomerId,
				t: null,
				id: null,
			}),
		};
	}

	return { list, has_more: false, next_cursor: null };
};
