import type { NumberMatcher, StringMatcher } from "../matcher.js";

/** Omitted `$in` is not `[]` — a missing op is not an empty set. */
const stringSetsAreSame = (left?: string[], right?: string[]): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;
	if (left.length !== right.length) return false;
	const unmatched = [...right];
	return left.every((value) => {
		const index = unmatched.indexOf(value);
		if (index === -1) return false;
		unmatched.splice(index, 1);
		return true;
	});
};

const numberSetsAreSame = (left?: number[], right?: number[]): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;
	if (left.length !== right.length) return false;
	const unmatched = [...right];
	return left.every((value) => {
		const index = unmatched.indexOf(value);
		if (index === -1) return false;
		unmatched.splice(index, 1);
		return true;
	});
};

/** Bare `"x"` and `{ $eq: "x" }` are the same matcher. Other ops are listed. */
export const stringMatchersAreSame = (
	left?: StringMatcher,
	right?: StringMatcher,
): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;

	const leftEq = stringMatcherAsEq(left);
	const rightEq = stringMatcherAsEq(right);
	if (leftEq.eq && rightEq.eq) return leftEq.value === rightEq.value;
	if (leftEq.eq || rightEq.eq) return false;
	if (typeof left === "string" || typeof right === "string") return false;
	if (left === null || right === null) return false;

	return (
		left.$eq === right.$eq &&
		left.$ne === right.$ne &&
		stringSetsAreSame(left.$in, right.$in) &&
		stringSetsAreSame(left.$nin, right.$nin) &&
		left.$regex === right.$regex &&
		left.$startsWith === right.$startsWith
	);
};

const stringMatcherAsEq = (
	matcher: StringMatcher,
): { eq: true; value: string | null } | { eq: false } => {
	if (matcher === null) return { eq: true, value: null };
	if (typeof matcher === "string") return { eq: true, value: matcher };
	const hasOther =
		matcher.$ne !== undefined ||
		matcher.$in !== undefined ||
		matcher.$nin !== undefined ||
		matcher.$regex !== undefined ||
		matcher.$startsWith !== undefined;
	if (!hasOther && matcher.$eq !== undefined) {
		return { eq: true, value: matcher.$eq };
	}
	return { eq: false };
};

export const numberMatchersAreSame = (
	left?: NumberMatcher,
	right?: NumberMatcher,
): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;

	const leftEq = numberMatcherAsEq(left);
	const rightEq = numberMatcherAsEq(right);
	if (leftEq.eq && rightEq.eq) return leftEq.value === rightEq.value;
	if (leftEq.eq || rightEq.eq) return false;
	if (typeof left === "number" || typeof right === "number") return false;
	if (left === null || right === null) return false;

	return (
		left.$eq === right.$eq &&
		left.$ne === right.$ne &&
		numberSetsAreSame(left.$in, right.$in) &&
		numberSetsAreSame(left.$nin, right.$nin) &&
		left.$gt === right.$gt &&
		left.$gte === right.$gte &&
		left.$lt === right.$lt &&
		left.$lte === right.$lte
	);
};

const numberMatcherAsEq = (
	matcher: NumberMatcher,
): { eq: true; value: number | null } | { eq: false } => {
	if (matcher === null) return { eq: true, value: null };
	if (typeof matcher === "number") return { eq: true, value: matcher };
	const hasOther =
		matcher.$ne !== undefined ||
		matcher.$in !== undefined ||
		matcher.$nin !== undefined ||
		matcher.$gt !== undefined ||
		matcher.$gte !== undefined ||
		matcher.$lt !== undefined ||
		matcher.$lte !== undefined;
	if (!hasOther && matcher.$eq !== undefined) {
		return { eq: true, value: matcher.$eq };
	}
	return { eq: false };
};
