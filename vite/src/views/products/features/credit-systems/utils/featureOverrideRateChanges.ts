import type {
	Feature,
	FeatureConfigOverride,
	FeatureMarkupsOverride,
} from "@autumn/shared";
import {
	featureOverrideRateCard,
	type RateCardLine,
} from "./featureOverrideRateCard";

/** One rate card row before and after; `null` means the row is absent on that side. */
export type RateChange = {
	key: string;
	label: string;
	from: string | null;
	to: string | null;
};

const creditSystemMarkups = (
	creditSystem: Feature | undefined,
): FeatureMarkupsOverride | undefined => {
	const config = creditSystem?.config;
	if (config?.default_markup === undefined && !config?.provider_markups)
		return undefined;
	return {
		default_markup: config.default_markup,
		provider_markups: config.provider_markups,
	};
};

/** Each override level replaces the credit system's own; an unset level inherits it. */
const effectiveOverride = ({
	override,
	creditSystem,
}: {
	override: FeatureConfigOverride | null;
	creditSystem: Feature | undefined;
}): FeatureConfigOverride => ({
	schema: override?.schema ?? creditSystem?.config?.schema ?? [],
	markups: override?.markups ?? creditSystemMarkups(creditSystem),
});

const lineChange = ({
	before,
	after,
}: {
	before: RateCardLine | undefined;
	after: RateCardLine | undefined;
}): RateChange | null => {
	const line = after ?? before;
	if (!line || before?.detail === after?.detail) return null;
	const useDetail = before?.value === after?.value;
	const text = (side: RateCardLine | undefined) => {
		if (!side) return null;
		return useDetail ? side.detail : side.value;
	};
	return {
		key: line.key,
		label: line.label,
		from: text(before),
		to: text(after),
	};
};

/** Rate card rows whose effective rate differs between two overrides of one credit system. */
export const diffFeatureOverrideRates = ({
	previous,
	next,
	creditSystem,
	features,
}: {
	previous: FeatureConfigOverride | null;
	next: FeatureConfigOverride | null;
	creditSystem: Feature | undefined;
	features: Feature[];
}): RateChange[] => {
	const rateCard = (override: FeatureConfigOverride | null) =>
		featureOverrideRateCard({
			override: effectiveOverride({ override, creditSystem }),
			features,
			capitalize: false,
		});
	const before = new Map(rateCard(previous).map((line) => [line.key, line]));
	const after = rateCard(next);
	const afterKeys = new Set(after.map((line) => line.key));

	return [
		...after.map((line) =>
			lineChange({ before: before.get(line.key), after: line }),
		),
		...[...before.values()]
			.filter((line) => !afterKeys.has(line.key))
			.map((line) => lineChange({ before: line, after: undefined })),
	].filter((change) => change !== null);
};

/** A new item's full rate card, read as rows with nothing before them. */
export const featureOverrideRateCardChanges = ({
	override,
	features,
}: {
	override: FeatureConfigOverride;
	features: Feature[];
}): RateChange[] =>
	featureOverrideRateCard({ override, features, capitalize: false }).map(
		({ key, label, value }) => ({ key, label, from: null, to: value }),
	);

/** An added item's rate rows: a diff against the item it replaces when known, else its own rate card. */
export const replacementRateChanges = ({
	replaced,
	next,
	creditSystem,
	features,
}: {
	replaced: { override: FeatureConfigOverride | null } | undefined;
	next: FeatureConfigOverride | null;
	creditSystem: Feature | undefined;
	features: Feature[];
}): RateChange[] => {
	if (replaced)
		return diffFeatureOverrideRates({
			previous: replaced.override,
			next,
			creditSystem,
			features,
		});
	if (!next) return [];
	return featureOverrideRateCardChanges({ override: next, features });
};

const splitLeadingAmount = (text: string) => {
	const [amount, ...rest] = text.split(" ");
	return { amount, unit: rest.join(" ") };
};

/** Collapses a shared unit so "2.857 credits → 3.571 credits" reads "2.857 → 3.571 credits". */
export const rateChangeParts = ({
	from,
	to,
}: RateChange): { from: string | null; to: string; unit: string } => {
	if (to === null) return { from, to: "removed", unit: "" };
	if (from === null) return { from, to, unit: "" };
	const before = splitLeadingAmount(from);
	const after = splitLeadingAmount(to);
	if (!before.unit || before.unit !== after.unit) return { from, to, unit: "" };
	return { from: before.amount, to: after.amount, unit: ` ${after.unit}` };
};

export const rateChangeText = (change: RateChange) => {
	const { from, to, unit } = rateChangeParts(change);
	return from === null ? `${to}${unit}` : `${from} → ${to}${unit}`;
};
