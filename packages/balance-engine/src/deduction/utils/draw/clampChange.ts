import { Decimal } from "decimal.js";

const deductible = ({
	current,
	amount,
	floor,
}: {
	current: Decimal;
	amount: Decimal;
	floor: number | null;
}): Decimal =>
	floor === null
		? amount
		: Decimal.min(amount, Decimal.max(0, current.minus(floor)));

const refundable = ({
	current,
	amount,
	ceiling,
}: {
	current: Decimal;
	amount: Decimal;
	ceiling: number | null;
}): Decimal =>
	ceiling === null
		? amount
		: Decimal.min(amount, Decimal.max(0, new Decimal(ceiling).minus(current)));

export const clampChange = ({
	current,
	amount,
	floor,
	ceiling,
}: {
	current: Decimal;
	amount: Decimal;
	floor: number | null;
	ceiling: number | null;
}): Decimal =>
	amount.lt(0)
		? refundable({ current, amount: amount.neg(), ceiling }).neg()
		: deductible({ current, amount, floor });
