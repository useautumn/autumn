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

	return licenseBillingPriceRows.flatMap((row) => {
		if (!isRecurringBasePriceRow({ row })) return [row];

		const quantity = Math.min(row.quantity, remainingQuantity);
		remainingQuantity -= quantity;
		return quantity > 0 ? [{ ...row, quantity }] : [];
	});
};
