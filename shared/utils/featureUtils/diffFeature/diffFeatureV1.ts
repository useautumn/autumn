import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";

type FeatureDisplay = ApiFeatureV1["display"];
type CreditSchema = ApiFeatureV1["credit_schema"];
type ModelMarkups = ApiFeatureV1["model_markups"];
type ProviderMarkups = ApiFeatureV1["provider_markups"];

const nullableNumbersEqual = (
	left: number | null | undefined,
	right: number | null | undefined,
) => (left ?? null) === (right ?? null);

const stringArraysEqualUnordered = (
	left: string[] | null | undefined,
	right: string[] | null | undefined,
) => {
	const sortedLeft = [...(left ?? [])].sort();
	const sortedRight = [...(right ?? [])].sort();
	return (
		sortedLeft.length === sortedRight.length &&
		sortedLeft.every((value, index) => value === sortedRight[index])
	);
};

const displaysEqual = (left: FeatureDisplay, right: FeatureDisplay) => {
	if (!left && !right) return true;
	if (!left || !right) return false;
	return (
		(left.singular ?? null) === (right.singular ?? null) &&
		(left.plural ?? null) === (right.plural ?? null)
	);
};

const creditSchemasEqual = (left: CreditSchema, right: CreditSchema) => {
	const leftEntries = left ?? [];
	const rightEntries = right ?? [];
	const costByFeatureId = new Map(
		leftEntries.map((entry) => [entry.metered_feature_id, entry.credit_cost]),
	);
	return (
		leftEntries.length === rightEntries.length &&
		rightEntries.every(
			(entry) =>
				costByFeatureId.get(entry.metered_feature_id) === entry.credit_cost,
		)
	);
};

const recordsEqual = <T>(
	left: Record<string, T> | null | undefined,
	right: Record<string, T> | null | undefined,
	entriesEqual: (leftEntry: T, rightEntry: T) => boolean,
) => {
	const leftRecord = left ?? {};
	const rightRecord = right ?? {};
	const leftKeys = Object.keys(leftRecord);
	return (
		leftKeys.length === Object.keys(rightRecord).length &&
		leftKeys.every(
			(key) =>
				rightRecord[key] !== undefined &&
				entriesEqual(leftRecord[key], rightRecord[key]),
		)
	);
};

const modelMarkupsEqual = (left: ModelMarkups, right: ModelMarkups) =>
	recordsEqual(
		left,
		right,
		(leftEntry, rightEntry) =>
			nullableNumbersEqual(leftEntry.markup, rightEntry.markup) &&
			nullableNumbersEqual(leftEntry.input_cost, rightEntry.input_cost) &&
			nullableNumbersEqual(leftEntry.output_cost, rightEntry.output_cost),
	);

const providerMarkupsEqual = (left: ProviderMarkups, right: ProviderMarkups) =>
	recordsEqual(left, right, (leftEntry, rightEntry) =>
		nullableNumbersEqual(leftEntry.markup, rightEntry.markup),
	);

type FieldComparison = {
	key: keyof ApiFeatureV1;
	isSame: (from: ApiFeatureV1, to: ApiFeatureV1) => boolean;
};

/** Absent and default values compare equal — undefined event_names == [],
 * undefined markups == {}, nullish numbers match — so db-side rows and
 * param-side rows never phantom-diff. */
const fieldComparisons: FieldComparison[] = [
	{ key: "id", isSame: (from, to) => from.id === to.id },
	{ key: "name", isSame: (from, to) => from.name === to.name },
	{ key: "type", isSame: (from, to) => from.type === to.type },
	{
		key: "consumable",
		isSame: (from, to) =>
			(from.consumable ?? false) === (to.consumable ?? false),
	},
	{
		key: "archived",
		isSame: (from, to) => (from.archived ?? false) === (to.archived ?? false),
	},
	{
		key: "display",
		isSame: (from, to) => displaysEqual(from.display, to.display),
	},
	{
		key: "event_names",
		isSame: (from, to) =>
			stringArraysEqualUnordered(from.event_names, to.event_names),
	},
	{
		key: "credit_schema",
		isSame: (from, to) =>
			creditSchemasEqual(from.credit_schema, to.credit_schema),
	},
	{
		key: "default_markup",
		isSame: (from, to) =>
			nullableNumbersEqual(from.default_markup, to.default_markup),
	},
	{
		key: "model_markups",
		isSame: (from, to) =>
			modelMarkupsEqual(from.model_markups, to.model_markups),
	},
	{
		key: "provider_markups",
		isSame: (from, to) =>
			providerMarkupsEqual(from.provider_markups, to.provider_markups),
	},
];

export const diffFeatureV1 = ({
	from,
	to,
}: {
	from: ApiFeatureV1;
	to: ApiFeatureV1;
}): { previous_attributes: Record<string, unknown> | null } => {
	const previous: Record<string, unknown> = {};

	for (const { key, isSame } of fieldComparisons) {
		if (!isSame(from, to)) {
			previous[key] = from[key] ?? null;
		}
	}

	return {
		previous_attributes: Object.keys(previous).length > 0 ? previous : null,
	};
};
