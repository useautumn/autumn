import { Decimal } from "decimal.js";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";

export const applyBackdatedLineItemAmount = ({
	amount,
	context,
}: {
	amount: number;
	context: LineItemContext;
}) => {
	const cycleCount = context.backdate?.cycleCount;
	if (!cycleCount) return amount;
	if (context.direction !== "charge") return amount;
	if (context.billingTiming !== "in_advance") return amount;

	return new Decimal(amount).mul(cycleCount).toDP(2).toNumber();
};
