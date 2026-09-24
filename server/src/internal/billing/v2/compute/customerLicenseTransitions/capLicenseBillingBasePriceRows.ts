import {
	isFixedPrice,
	isOneOffPrice,
	type LicenseBillingPriceRow,
} from "@autumn/shared";

const isRecurringBasePriceRow = ({
	row,
}: {
	row: LicenseBillingPriceRow;
}): boolean =>
	row.price.entitlement_id == null &&
	isFixedPrice(row.price) &&
	!isOneOffPrice(row.price);

export const capLicenseBillingBasePriceRows = ({
	licenseBillingPriceRows,
	targetQuantity,
}: {
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	targetQuantity: number;
}): LicenseBillingPriceRow[] => {
	let remainingQuantity = targetQuantity;
	const cappedQuantityByIndex = new Map<number, number>();
	const recurringBasePriceRows = licenseBillingPriceRows
		.map((row, index) => ({ index, row }))
		.filter(({ row }) => isRecurringBasePriceRow({ row }))
		.sort(({ row: rowA }, { row: rowB }) =>
			rowA.price.id.localeCompare(rowB.price.id),
		);

	for (const { index, row } of recurringBasePriceRows) {
		const quantity = Math.min(row.quantity, remainingQuantity);
		cappedQuantityByIndex.set(index, quantity);
		remainingQuantity -= quantity;
	}

	return licenseBillingPriceRows.flatMap((row, index) => {
		if (!isRecurringBasePriceRow({ row })) return [row];

		const quantity = cappedQuantityByIndex.get(index) ?? 0;
		return quantity > 0 ? [{ ...row, quantity }] : [];
	});
};
