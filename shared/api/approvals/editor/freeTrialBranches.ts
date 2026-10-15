import { isPlainObject } from "../schemas/isPlainObject";
import type { TrialDuration, TrialUnit } from "./editorFields";
import { entriesOf, isCapOperator } from "./filterParts";

const UNIT_DAYS: Record<TrialUnit, number> = { day: 1, month: 30, year: 365 };
const UNITS = Object.keys(UNIT_DAYS) as TrialUnit[];

// Trial lengths are whole numbers, so a unit whose threshold is under 1 passes all or none.
const passesNoLength = ({
	operator,
	threshold,
}: {
	operator: string;
	threshold: number;
}) =>
	(operator === "lt" && threshold <= 1) ||
	(operator === "lte" && threshold < 1);

const passesEveryLength = ({
	operator,
	threshold,
}: {
	operator: string;
	threshold: number;
}) => (operator === "gt" || operator === "gte") && threshold < 1;

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
	const unitBranches = UNITS.flatMap((unit) => {
		const threshold = days / UNIT_DAYS[unit];
		if (passesNoLength({ operator, threshold })) return [];
		if (passesEveryLength({ operator, threshold })) {
			return [{ free_trial: { duration_type: unit } }];
		}
		return [
			{
				free_trial: {
					duration_type: unit,
					duration_length: { [`$${operator}`]: threshold },
				},
			},
		];
	});
	return isCapOperator(operator)
		? [{ free_trial: null }, ...unitBranches]
		: unitBranches;
};

/** Reads the largest unit whose threshold is whole; the caller re-expands to confirm. */
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
	const whole = limits.reverse().find(({ length }) => Number.isInteger(length));
	if (!whole) return null;
	return {
		operator: whole.key.slice(1),
		duration: { length: whole.length as number, unit: whole.unit },
	};
};
