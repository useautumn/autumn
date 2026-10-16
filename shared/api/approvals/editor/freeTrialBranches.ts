import { isPlainObject } from "../schemas/isPlainObject";
import type { TrialDuration, TrialUnit } from "./editorFields";
import { entriesOf, isCapOperator } from "./filterParts";

const UNIT_DAYS: Record<TrialUnit, number> = { day: 1, month: 30, year: 365 };
const UNITS = Object.keys(UNIT_DAYS) as TrialUnit[];

/**
 * One duration row → a branch per trial unit, in days / months / years.
 * Caps (<, ≤) also let requests with no trial through.
 */
export const toTrialBranches = ({
	operator,
	duration,
}: {
	operator: string;
	duration: TrialDuration;
}) => {
	const days = duration.length * UNIT_DAYS[duration.unit];
	// Trial lengths can be fractional, so every unit keeps its own threshold.
	const unitBranches = UNITS.map((unit) => ({
		free_trial: {
			duration_type: unit,
			duration_length: { [`$${operator}`]: days / UNIT_DAYS[unit] },
		},
	}));
	return isCapOperator(operator)
		? [{ free_trial: null }, ...unitBranches]
		: unitBranches;
};

/**
 * Reads the largest unit whose threshold is a whole, non-zero number, else days.
 * The caller re-expands to confirm.
 */
export const fromTrialBranches = (
	branches: unknown,
): { operator: string; duration: TrialDuration } | null => {
	if (!Array.isArray(branches)) return null;
	const limits = branches.flatMap((branch) => {
		const trial = isPlainObject(branch) ? branch.free_trial : null;
		if (!isPlainObject(trial)) return [];
		return entriesOf(trial.duration_length).map(([key, length]) => ({
			unit: trial.duration_type as TrialUnit,
			key,
			length,
		}));
	});
	const limit =
		[...limits]
			.reverse()
			.find(({ length }) => Number.isInteger(length) && length !== 0) ??
		limits.find(({ unit }) => unit === "day");
	if (!limit) return null;
	return {
		operator: limit.key.slice(1),
		duration: { length: limit.length as number, unit: limit.unit },
	};
};
