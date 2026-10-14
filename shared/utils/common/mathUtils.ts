import { Decimal } from "decimal.js";

export const addSafe = ({
	left,
	right,
}: {
	left: number | null | undefined;
	right: number | null | undefined;
}) => new Decimal(left ?? 0).plus(right ?? 0).toNumber();

export const subtractSafe = ({
	left,
	right,
}: {
	left: number | null | undefined;
	right: number | null | undefined;
}) => new Decimal(left ?? 0).minus(right ?? 0).toNumber();

export const roundCacheBalance = (value: number | null | undefined): number => {
	if (value === null || value === undefined) return 0;
	return new Decimal(value).toDecimalPlaces(10).toNumber();
};

export const percentageOf = ({
	part,
	whole,
}: {
	part: number;
	whole: number;
}) => new Decimal(part).div(whole).mul(100).toNumber();
