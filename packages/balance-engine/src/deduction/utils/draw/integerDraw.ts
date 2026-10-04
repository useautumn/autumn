import { isExactInteger } from "../../../utils/numberUtils/exactIntegerUtils.js";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionDelta } from "../../types/deductionDelta.js";
import type { DeductionRequest } from "../../types/deductionRequest.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionBucket } from "./deductFromRows.js";

const isExactBound = (value: number | null): boolean =>
	value === null || isExactInteger(value);

const isFlatIntegerRow = (row: DeductionRow): boolean =>
	row.creditCost === 1 &&
	row.rateCard === null &&
	isExactInteger(row.balance) &&
	isExactBound(row.minBalance) &&
	isExactBound(row.maxBalance);

/** A draw plain numbers settle exactly: flat 1:1 rows, integers, and no window, gate or enforced spend limit to price. */
export const isIntegerDraw = ({
	context,
	request,
}: {
	context: DeductionContext;
	request: DeductionRequest;
}): boolean =>
	isExactInteger(request.value) &&
	context.usageWindowLimits.length === 0 &&
	context.allocationGates.size === 0 &&
	context.rows.every(isFlatIntegerRow) &&
	context.rolloverRows.every(isFlatIntegerRow) &&
	(!request.terms.enforcesSpendLimit ||
		context.rows.every(
			(row) => context.spendLimitByFeatureId[row.featureId] === undefined,
		));

type IntegerDraw = {
	remaining: number;
	deltas: DeductionDelta[];
	overageBehavior: DeductionRequest["terms"]["overageBehavior"];
};

const allowsNegative = (draw: IntegerDraw): boolean =>
	draw.overageBehavior === "overflow";

const isUsageAllowed = ({
	row,
	draw,
}: {
	row: DeductionRow;
	draw: IntegerDraw;
}): boolean =>
	row.usageAllowed || (row.freeAllocated && draw.overageBehavior !== "reject");

/** `bucketToRows` on numbers. */
const bucketToRows = ({
	context,
	draw,
	bucket,
}: {
	context: DeductionContext;
	draw: IntegerDraw;
	bucket: DeductionBucket;
}): DeductionRow[] => {
	switch (bucket) {
		case "unlimited": {
			const [firstRow] = context.rows;
			return firstRow?.unlimited ? [firstRow] : [];
		}
		case "rollovers":
			return draw.remaining < 0 ? [] : context.rolloverRows;
		case "included":
			return context.rows;
		case "overage": {
			const admitsEveryRow = allowsNegative(draw) || draw.remaining < 0;
			return context.rows.filter(
				(row) => admitsEveryRow || isUsageAllowed({ row, draw }),
			);
		}
	}
};

/** `boundsOf` on numbers. */
const boundsOf = ({
	row,
	bucket,
	draw,
}: {
	row: DeductionRow;
	bucket: DeductionBucket;
	draw: IntegerDraw;
}): { floor: number | null; ceiling: number | null } => {
	switch (bucket) {
		case "unlimited":
			return { floor: null, ceiling: null };
		case "rollovers":
		case "included":
			return { floor: 0, ceiling: 0 };
		case "overage":
			return {
				floor: allowsNegative(draw) ? null : row.minBalance,
				ceiling: allowsNegative(draw) ? null : row.maxBalance,
			};
	}
};

/** `clampChange` on numbers. */
const clampChange = ({
	current,
	amount,
	floor,
	ceiling,
}: {
	current: number;
	amount: number;
	floor: number | null;
	ceiling: number | null;
}): number => {
	if (amount < 0)
		return ceiling === null
			? amount
			: -Math.min(-amount, Math.max(0, ceiling - current));
	return floor === null
		? amount
		: Math.min(amount, Math.max(0, current - floor));
};

const currentBalanceOf = ({
	row,
	deltas,
}: {
	row: DeductionRow;
	deltas: DeductionDelta[];
}): number => {
	let balance = row.balance;
	for (const delta of deltas)
		if (
			delta.table === row.table &&
			delta.id === row.id &&
			delta.entityKey === row.entityKey
		)
			balance += delta.balanceDelta;
	return balance;
};

/** `deductFromRows` for a flat 1:1 row: the credits a row gives are the units it covers. */
const drawFromRows = ({
	draw,
	rows,
	bucket,
}: {
	draw: IntegerDraw;
	rows: DeductionRow[];
	bucket: DeductionBucket;
}): void => {
	for (const row of rows) {
		if (draw.remaining === 0) return;
		const bounds = boundsOf({ row, bucket, draw });
		const change = clampChange({
			current: currentBalanceOf({ row, deltas: draw.deltas }),
			amount: draw.remaining,
			floor: bounds.floor,
			ceiling: bounds.ceiling,
		});
		if (change === 0) continue;
		draw.deltas.push({
			table: row.table,
			id: row.id,
			entityKey: row.entityKey,
			balanceDelta: -change,
			usageDelta: row.table === "rollovers" ? change : 0,
			valueDelta: -change,
			creditCost: 1,
		});
		draw.remaining -= change;
	}
};

/** `deductFromBuckets` in plain numbers, for a draw `isIntegerDraw` admits: the same deltas and remainder. */
export const drawIntegersFromBuckets = ({
	context,
	request,
}: {
	context: DeductionContext;
	request: DeductionRequest;
}): { remaining: number; deltas: DeductionDelta[] } => {
	const draw: IntegerDraw = {
		remaining: request.value,
		deltas: [],
		overageBehavior: request.terms.overageBehavior,
	};
	for (const bucket of [
		"unlimited",
		"rollovers",
		"included",
		"overage",
	] as const)
		drawFromRows({
			draw,
			rows: bucketToRows({ context, draw, bucket }),
			bucket,
		});
	return { remaining: draw.remaining, deltas: draw.deltas };
};
