import type { ProcessorItemPrice } from "@autumn/shared";
import { Decimal } from "decimal.js";

/** Recurring charge for a flat per-unit item; null when it depends on usage or tiers. */
export const processorItemAmount = ({
	price,
	quantity,
}: {
	price: ProcessorItemPrice | null;
	quantity: number | null;
}) => {
	if (!price || price.unit_amount === null) return null;
	if (price.usage_type === "metered" || price.tiers) return null;
	if ((price.units_per_quantity ?? 1) !== 1) return null;

	return new Decimal(price.unit_amount).mul(quantity ?? 1).toNumber();
};
