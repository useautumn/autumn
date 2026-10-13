import {
	apiFeatureOverrideToDb,
	type CreditSchemaItem,
	type CreditTier,
	type Feature,
	type FeatureConfigOverride,
	type FeatureMarkupsOverride,
	FeatureType,
	findFeatureById,
	hasCreditDimensionRules,
	itemsEqualIgnoringFeatureOverride,
	numberWithCommas,
	type UpdatePlanOp,
} from "@autumn/shared";
import { featureDisplayName } from "@/views/products/features/credit-systems/utils/featureDisplayName";

type Customize = NonNullable<UpdatePlanOp["customize"]>;
export type AddItem = NonNullable<Customize["add_items"]>[number];
export type RemoveFilter = NonNullable<Customize["remove_items"]>[number];

/** `value` is the rate card text; `detail` spells out every rule so two different rates never read the same. */
type RateLine = {
	key: string;
	label: string;
	meteredFeatureId?: string;
	value: string;
	detail: string;
};
/** One rate before and after; `null` means absent on that side. */
export type RateChange = Pick<
	RateLine,
	"key" | "label" | "meteredFeatureId"
> & {
	from: string | null;
	to: string | null;
};
export type ItemRateRow = {
	addIndex: number;
	removeIndex: number | undefined;
	changes: RateChange[];
	/** The add and its paired remove are one item whose rate card alone changed. */
	updated: boolean;
};

// Rate card text

const plural = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;
const markupText = (markup: number | undefined) => `${markup ?? 0}% markup`;
const matchText = (match: Record<string, string>) =>
	`(${Object.entries(match)
		.map(([key, value]) => `${key}=${value}`)
		.join(", ")})`;

const baseRateText = (
	rate: {
		credit_amount?: number;
		tier_behavior?: "graduated";
		tiers?: CreditTier[];
	},
	detailed: boolean,
) => {
	if (rate.tier_behavior !== "graduated" || !rate.tiers)
		return `${numberWithCommas(rate.credit_amount ?? 0)} credits`;
	if (!detailed) {
		const costs = rate.tiers.map((tier) => tier.credit_amount);
		return `${Math.min(...costs)}–${Math.max(...costs)} credits (tiered)`;
	}
	const tiers = rate.tiers.map((tier, index) =>
		tier.to === "inf"
			? `${numberWithCommas(tier.credit_amount)} above`
			: `${numberWithCommas(tier.credit_amount)}${index === 0 ? " credits" : ""} up to ${numberWithCommas(tier.to)}`,
	);
	return `${tiers.join(" · ")} (tiered)`;
};

/** AI credit children are metered in dollars, so their rate reads per $. */
const perUnitsText = (item: CreditSchemaItem, perDollar: boolean) => {
	const units = item.feature_amount ?? 1;
	if (perDollar) return ` / $${units === 1 ? "" : numberWithCommas(units)}`;
	return units === 1 ? "" : ` per ${numberWithCommas(units)}`;
};

const creditLine = (item: CreditSchemaItem, perDollar: boolean) => {
	const flat = `${baseRateText(item, false)}${perUnitsText(item, perDollar)}`;
	const dimensions = Object.entries(item.dimensions ?? {});
	const multipliers = Object.entries(item.multipliers ?? {});
	const counts = [
		dimensions.length ? plural(dimensions.length, "rate") : null,
		multipliers.length ? plural(multipliers.length, "multiplier") : null,
	].filter((part) => part !== null);
	const rules = [
		...dimensions.map(
			([name, dim]) =>
				`${name} ${matchText(dim.match)}${dim.priority === undefined ? "" : ` priority ${dim.priority}`} ${baseRateText(dim, true)}`,
		),
		...multipliers.map(([name, mult]) =>
			[
				name,
				matchText(mult.match),
				mult.factor === undefined ? null : `×${mult.factor}`,
				mult.add === undefined ? null : `+${mult.add}`,
			]
				.filter((part) => part !== null)
				.join(" "),
		),
	];
	return {
		value: hasCreditDimensionRules(item)
			? `varies by event · ${counts.join(", ")}`
			: flat,
		detail: [
			`${baseRateText(item, true)}${perUnitsText(item, perDollar)}`,
			...rules,
		].join(" · "),
	};
};

const markupLines = (markups: FeatureMarkupsOverride): RateLine[] => {
	const line = (key: string, label: string, text: string) => ({
		key,
		label,
		value: text,
		detail: text,
	});
	const models = Object.entries(markups.model_markups ?? {});
	return [
		line("default-markup", "Default", markupText(markups.default_markup)),
		...Object.entries(markups.provider_markups ?? {}).map(([provider, entry]) =>
			line(`provider-${provider}`, provider, markupText(entry?.markup)),
		),
		...(models.length > 0
			? [
					{
						key: "model-markups",
						label: "Per-model",
						value: plural(models.length, "model"),
						detail: models
							.map(([model, entry]) => `${model} ${markupText(entry.markup)}`)
							.sort()
							.join(", "),
					},
				]
			: []),
	];
};

/** Rate card rows for a feature override: per-feature rates, then markups. */
export const featureOverrideRateCard = ({
	override,
	features,
	capitalize = true,
	creditSystem,
}: {
	override: FeatureConfigOverride;
	features: Feature[];
	capitalize?: boolean;
	creditSystem?: Feature;
}): RateLine[] => [
	...(override.schema ?? []).map((item) => ({
		key: `feature-${item.metered_feature_id}`,
		meteredFeatureId: item.metered_feature_id,
		label: featureDisplayName({
			features,
			featureId: item.metered_feature_id,
			plural: true,
			capitalize,
		}),
		...creditLine(item, creditSystem?.type === FeatureType.AiCreditSystem),
	})),
	...(override.markups ? markupLines(override.markups) : []),
];

// Diffing two rate cards

/** Each override level replaces the credit system's own; an unset level inherits it. */
const effectiveOverride = (
	override: FeatureConfigOverride | null,
	creditSystem: Feature | undefined,
): FeatureConfigOverride => {
	const config = creditSystem?.config;
	const inherited =
		config?.default_markup !== undefined ||
		config?.provider_markups ||
		creditSystem?.model_markups
			? {
					default_markup: config?.default_markup,
					provider_markups: config?.provider_markups,
					model_markups: creditSystem?.model_markups,
				}
			: undefined;
	return {
		schema: override?.schema ?? config?.schema ?? [],
		markups: override?.markups ?? inherited,
	};
};

const rateCardRows = ({
	previous,
	next,
	creditSystem,
	features,
}: {
	previous: FeatureConfigOverride | null | undefined;
	next: FeatureConfigOverride | null;
	creditSystem: Feature | undefined;
	features: Feature[];
}): RateChange[] => {
	const card = (override: FeatureConfigOverride) =>
		featureOverrideRateCard({
			override,
			features,
			capitalize: false,
			creditSystem,
		});
	// With nothing to diff against, show the card's own summary text.
	const text = previous === undefined ? "value" : "detail";
	const before = new Map(
		card(
			previous === undefined ? {} : effectiveOverride(previous, creditSystem),
		).map((line) => [line.key, line]),
	);
	const after = card(
		previous === undefined
			? (next ?? {})
			: effectiveOverride(next, creditSystem),
	);
	const keys = [
		...new Set([...after.map((line) => line.key), ...before.keys()]),
	];
	const afterByKey = new Map(after.map((line) => [line.key, line]));
	// Detailed text on both sides, so a count summary never hides which rule changed.
	return keys.flatMap((key) => {
		const [from, to] = [before.get(key), afterByKey.get(key)];
		const line = to ?? from;
		if (!line || from?.detail === to?.detail) return [];
		return [
			{
				key,
				label: line.label,
				meteredFeatureId: line.meteredFeatureId,
				from: from?.[text] ?? null,
				to: to?.[text] ?? null,
			},
		];
	});
};

/** Collapses a shared unit so "2.857 credits → 3.571 credits" reads "2.857 → 3.571 credits". */
export const rateChangeParts = ({ from, to }: RateChange) => {
	if (to === null) return { from, to: "removed", unit: "" };
	const split = (text: string) => {
		const [amount, ...rest] = text.split(" ");
		return { amount, unit: rest.join(" ") };
	};
	if (from === null) return { from, to, unit: "" };
	const [before, after] = [split(from), split(to)];
	if (!before.unit || before.unit !== after.unit) return { from, to, unit: "" };
	return { from: before.amount, to: after.amount, unit: ` ${after.unit}` };
};

export const rateChangeText = (change: RateChange) => {
	const { from, to, unit } = rateChangeParts(change);
	return from === null ? `${to}${unit}` : `${from} → ${to}${unit}`;
};

// Pairing a migration op's adds and removes

const sameCadence = (add: AddItem, remove: RemoveFilter) =>
	String(add.price?.interval ?? add.reset?.interval) ===
		String(remove.interval) &&
	(add.price?.interval_count ?? add.reset?.interval_count ?? 1) ===
		(remove.interval_count ?? 1);

/** The remove each add replaces: the only one of its feature, else the one on its cadence. */
const pairRemoveIndices = (customize: Customize | undefined) => {
	const removes = customize?.remove_items ?? [];
	const taken = new Set<number>();
	return (customize?.add_items ?? []).map((add) => {
		const candidates = removes.flatMap((remove, index) =>
			remove.feature_id === add.feature_id && !taken.has(index) ? [index] : [],
		);
		const index =
			candidates.length === 1
				? candidates[0]
				: candidates.find((i) => sameCadence(add, removes[i]));
		if (index !== undefined) taken.add(index);
		return index;
	});
};

/** The rates an added item sets: old → new against its paired remove's stamp, else its own rate card. */
const addItemRateChanges = ({
	add,
	remove,
	features,
}: {
	add: AddItem;
	remove: RemoveFilter | undefined;
	features: Feature[];
}): RateChange[] => {
	const next = add.feature_override
		? apiFeatureOverrideToDb(add.feature_override)
		: null;
	const diff = (previous: FeatureConfigOverride | null | undefined) =>
		rateCardRows({
			previous,
			next,
			features,
			creditSystem: findFeatureById({
				features,
				featureId: add.feature_id,
				errorOnNotFound: false,
			}),
		});
	// An empty stamp, or a flag with no stamp, means the old item inherited the credit system's rates.
	if (remove?.previous_feature_override)
		return diff(apiFeatureOverrideToDb(remove.previous_feature_override));
	return diff(remove?.only_feature_override_changed ? null : undefined);
};

/** An op's added items as rate rows; a pair the draft stamped as override-only becomes one updated row. */
export const migrationOpRateRows = ({
	op,
	features,
}: {
	op: UpdatePlanOp;
	features: Feature[];
}) => {
	const removes = op.customize?.remove_items ?? [];
	const rows: ItemRateRow[] = pairRemoveIndices(op.customize).map(
		(removeIndex, addIndex) => {
			const remove =
				removeIndex === undefined ? undefined : removes[removeIndex];
			const add = (op.customize?.add_items ?? [])[addIndex];
			const changes = addItemRateChanges({
				add,
				remove,
				features,
			});
			return {
				addIndex,
				removeIndex,
				changes,
				updated:
					remove?.only_feature_override_changed === true && changes.length > 0,
			};
		},
	);
	const mergedRemoveIndices = new Set(
		rows.flatMap((row) =>
			row.updated && row.removeIndex !== undefined ? [row.removeIndex] : [],
		),
	);
	return { rows, mergedRemoveIndices };
};

// Op form edits

const withoutStamps = ({
	previous_feature_override: _p,
	only_feature_override_changed: _o,
	...filter
}: RemoveFilter) => filter;

/** Replaces one added item, keeping the override the item editor can't show; any other change un-merges its pair. */
export const withEditedAddItem = ({
	customize,
	addIndex,
	item,
}: {
	customize: Customize | undefined;
	addIndex: number;
	item: AddItem;
}): Customize => {
	const previous = customize?.add_items?.[addIndex];
	const next = {
		...item,
		feature_override: item.feature_override ?? previous?.feature_override,
	};
	if (!next.feature_override) delete next.feature_override;
	const removeIndex = pairRemoveIndices(customize)[addIndex];
	const unmerge =
		!previous || !itemsEqualIgnoringFeatureOverride(previous, next);
	return {
		...customize,
		add_items: (customize?.add_items ?? []).map((current, index) =>
			index === addIndex ? next : current,
		),
		...(customize?.remove_items && {
			remove_items: customize.remove_items.map((filter, index) => {
				if (index !== removeIndex || !unmerge) return filter;
				const { only_feature_override_changed: _only, ...rest } = filter;
				return rest;
			}),
		}),
	};
};

/** A remove filter edited to match different items no longer describes the old item, so its display stamps go. */
export const withEditedRemoveFilter = ({
	previous,
	next,
}: {
	previous: RemoveFilter;
	next: RemoveFilter;
}) =>
	JSON.stringify(withoutStamps(previous)) ===
	JSON.stringify(withoutStamps(next))
		? next
		: withoutStamps(next);
