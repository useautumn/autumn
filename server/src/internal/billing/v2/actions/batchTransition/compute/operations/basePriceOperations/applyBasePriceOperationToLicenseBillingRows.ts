import type { LicenseBillingPriceRow } from "@autumn/shared";
import type { BasePriceOperation } from "../../../types/basePriceOperationTypes";

export const applyBasePriceOperationToLicenseBillingRows = ({
	licenseBillingPriceRows,
	operation,
	targetQuantity,
	addRowContext,
}: {
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	operation: BasePriceOperation | undefined;
	targetQuantity: number;
	addRowContext: Pick<LicenseBillingPriceRow, "customerProductId" | "source">;
}): LicenseBillingPriceRow[] => {
	if (!operation) return licenseBillingPriceRows;

	if (operation.type === "replace") {
		const fromPriceIds = new Set(operation.fromPriceIds);
		return licenseBillingPriceRows.map((row) =>
			fromPriceIds.has(row.price.id)
				? { ...row, price: operation.toPrice }
				: row,
		);
	}

	if (operation.type === "remove") {
		const fromPriceIds = new Set(operation.fromPriceIds);
		return licenseBillingPriceRows.filter(
			(row) => !fromPriceIds.has(row.price.id),
		);
	}

	const existingBasePriceIds = new Set(operation.existingBasePriceIds);
	let existingQuantity = 0;
	for (const row of licenseBillingPriceRows) {
		if (existingBasePriceIds.has(row.price.id)) {
			existingQuantity += row.quantity;
		}
	}
	const quantityToAdd = Math.max(0, targetQuantity - existingQuantity);
	if (quantityToAdd === 0) return licenseBillingPriceRows;

	return [
		...licenseBillingPriceRows,
		{
			...addRowContext,
			price: operation.toPrice,
			quantity: quantityToAdd,
		},
	];
};
