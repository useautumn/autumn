import { nullableFieldMatches } from "@api/common/filters/match/nullableFieldMatches";
import { numberMatcherMatches } from "@api/common/filters/match/numberMatcherMatches";
import { stringMatcherMatches } from "@api/common/filters/match/stringMatcherMatches";
import { isPlainObject } from "../../../schemas/isPlainObject";
import type { PlanChangeFilter } from "../../../schemas/when/planChangeFilter";
import type { FreeTrialFacts } from "../../facts/billingFacts";
import { describeNumberMatcher } from "../format/describeNumberMatcher";
import { pluralizeUnit } from "../format/pluralizeUnit";
import { leafField } from "./leafField";

type FreeTrialFilter = Exclude<
	NonNullable<PlanChangeFilter["free_trial"]>,
	{ $eq?: null; $ne?: null }
>;

const UNITS_BY_SIZE: string[] = ["day", "month", "year"];

const trialMatches = ({
	filter,
	trial,
}: {
	filter: FreeTrialFilter;
	trial: FreeTrialFacts;
}) =>
	numberMatcherMatches({
		matcher: filter.duration_length,
		value: trial.duration_length,
	}) &&
	stringMatcherMatches({
		matcher: filter.duration_type,
		value: trial.duration_type,
	}) &&
	(filter.card_required === undefined ||
		filter.card_required === trial.card_required) &&
	stringMatcherMatches({ matcher: filter.on_end, value: trial.on_end });

const asTrialFilter = ({ filter }: { filter: unknown }) =>
	isPlainObject(filter) && !("$eq" in filter) && !("$ne" in filter)
		? (filter as FreeTrialFilter)
		: undefined;

/** "< 2 months", "≤ 31 days, card required". */
const describeTrialLimit = ({ filter }: { filter: unknown }) => {
	const trialFilter = asTrialFilter({ filter });
	if (!trialFilter)
		return isPlainObject(filter) && filter.$ne === null ? "any" : "none";

	const unit =
		typeof trialFilter.duration_type === "string"
			? trialFilter.duration_type
			: null;
	const parts = [
		trialFilter.duration_length !== undefined &&
			describeNumberMatcher({
				matcher: trialFilter.duration_length,
				format: (count) =>
					unit ? pluralizeUnit({ count, unit }) : String(count),
			}),
		trialFilter.duration_length === undefined && unit && `in ${unit}s`,
		trialFilter.card_required === true && "card required",
		trialFilter.card_required === false && "no card",
		trialFilter.on_end && `on end: ${String(trialFilter.on_end)}`,
	];
	return parts.filter(Boolean).join(", ");
};

/**
 * Reported as one field, like the editor's single "Free trial" row. Its
 * `$or` of day and month branches shows only the largest-unit branch.
 */
export const freeTrialField = <Parent>({
	read,
}: {
	read: (parent: Parent) => FreeTrialFacts | null;
}) =>
	leafField<Parent>({
		label: "Free trial",
		matches: ({ filter, parent }) =>
			nullableFieldMatches<FreeTrialFilter>({
				filter: filter as PlanChangeFilter["free_trial"],
				value: read(parent),
				innerMatches: ({ filter: trialFilter, value }) =>
					trialMatches({ filter: trialFilter, trial: value as FreeTrialFacts }),
			}),
		describeLimit: describeTrialLimit,
		describeLimits: ({ filters }) => {
			const largestUnitFilter = filters.reduce((largest, filter) => {
				const unit = asTrialFilter({ filter })?.duration_type;
				const largestUnit = asTrialFilter({ filter: largest })?.duration_type;
				const isLarger =
					typeof unit === "string" &&
					(typeof largestUnit !== "string" ||
						UNITS_BY_SIZE.indexOf(unit) > UNITS_BY_SIZE.indexOf(largestUnit));
				return isLarger ? filter : largest;
			}, filters[0]);
			return describeTrialLimit({ filter: largestUnitFilter });
		},
		// Shows the trial's length, plus only the other parts the rule tests.
		describeActual: ({ filter, parent }) => {
			const trial = read(parent);
			if (!trial) return "none";
			const trialFilter = asTrialFilter({ filter });
			return [
				pluralizeUnit({
					count: trial.duration_length,
					unit: trial.duration_type,
				}),
				trialFilter?.card_required !== undefined &&
					(trial.card_required ? "card required" : "no card"),
				trialFilter?.on_end !== undefined && `on end: ${trial.on_end}`,
			]
				.filter(Boolean)
				.join(", ");
		},
	});
