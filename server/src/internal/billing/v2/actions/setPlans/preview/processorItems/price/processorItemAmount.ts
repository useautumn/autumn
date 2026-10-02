import type { ProcessorItemPrice } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { tieredProcessorItemAmount } from "./tieredProcessorItemAmount";

/** Recurring charge for a licensed item; null when it depends on usage. */
export const processorItemAmount = ({
	price,
	quantity,
}: {
	price: ProcessorItemPrice | null;
	quantity: number | null;
}) => {
	if (!price || price.usage_type === "metered") return null;
	if (price.tiers_mode) {
		return tieredProcessorItemAmount({ price, quantity: quantity ?? 1 });
	}
	if (price.unit_amount === null) return null;
	if ((price.units_per_quantity ?? 1) !== 1) return null;

	return new Decimal(price.unit_amount).mul(quantity ?? 1).toNumber();
};
