import {
	type ApiPlanItemV1,
	apiFeatureOverrideToDb,
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	creditSchemaItemsAreSame,
	type Feature,
	findFeatureById,
	getFeatureName,
	isAiCreditSystem,
	isExcludedCreditSchemaItem,
	itemsEqual,
	type PlanItemChangeV0,
} from "@autumn/shared";
import { creditRateSummary } from "./creditRateSummary";
import { featureDisplayName } from "./featureDisplayName";

/** One feature of a plan's effective rate card and where its rate comes from. */
export type RateCardRow = { featureId: string } & (
	| { state: "inherited"; rate: CreditSchemaItem }
	| { state: "changed"; rate: CreditSchemaItem; catalogRate: CreditSchemaItem }
	| { state: "excluded"; catalogRate: CreditSchemaItem }
	| { state: "added"; rate: CreditSchemaItem }
);

/** One feature's rate before and after a change; `null` means not covered on that side. */
export type FeatureRateChange = {
	featureId: string;
	label: string;
	from: string | null;
	to: string | null;
};

export type RateCardItemChange = {
	change: PlanItemChangeV0;
	rates: FeatureRateChange[];
};

const classifyCatalogRow = ({
	catalogRate,
	overrideRow,
}: {
	catalogRate: CreditSchemaItem;
	overrideRow: CreditSchemaOverrideItem | undefined;
}): RateCardRow => {
	const featureId = catalogRate.metered_feature_id;
	if (overrideRow && isExcludedCreditSchemaItem(overrideRow))
		return { featureId, state: "excluded", catalogRate };
	if (
		!overrideRow ||
		creditSchemaItemsAreSame({ left: overrideRow, right: catalogRate })
	)
		return { featureId, state: "inherited", rate: catalogRate };
	return { featureId, state: "changed", rate: overrideRow, catalogRate };
};

/** Catalog rows in the credit system's order, removed ones in place, then features the plan adds. */
export const rateCardRows = ({
	override,
	creditSystem,
}: {
	override: CreditSchemaOverrideItem[];
	creditSystem?: Feature;
}): RateCardRow[] => {
	const catalogSchema: CreditSchemaItem[] = creditSystem?.config?.schema ?? [];
	const overrideByFeature = new Map(
		override.map((row) => [row.metered_feature_id, row]),
	);
	const catalogIds = new Set(catalogSchema.map((r) => r.metered_feature_id));

	return [
		...catalogSchema.map((catalogRate) =>
			classifyCatalogRow({
				catalogRate,
				overrideRow: overrideByFeature.get(catalogRate.metered_feature_id),
			}),
		),
		...override.flatMap((row): RateCardRow[] =>
			catalogIds.has(row.metered_feature_id) || isExcludedCreditSchemaItem(row)
				? []
				: [{ featureId: row.metered_feature_id, state: "added", rate: row }],
		),
	];
};

/** "From Demo credits · 1 changed · 1 not covered", skipping counts that are zero. */
export const rateCardSubtitle = ({
	creditSystemName,
	rows,
}: {
	creditSystemName: string;
	rows: RateCardRow[];
}) => {
	const count = (state: RateCardRow["state"], label: string) => {
		const n = rows.filter((row) => row.state === state).length;
		return n > 0 && `${n} ${label}`;
	};
	return [
		`From ${creditSystemName}`,
		count("changed", "changed"),
		count("added", "added"),
		count("excluded", "not covered"),
	]
		.filter(Boolean)
		.join(" · ");
};

/** The credit system's own rate for a row, which edits are measured against. */
export const catalogRateOf = (row: RateCardRow) => {
	if (row.state === "inherited") return row.rate;
	return row.state === "added" ? undefined : row.catalogRate;
};

/** The unit a feature's rate is counted in, e.g. "web searches" or "of AI usage". */
export const rateUnit = ({
	feature,
	billingUnits = 1,
}: {
	feature?: Feature;
	billingUnits?: number;
}) => {
	const isAiChild = isAiCreditSystem(feature?.type);
	const unitName = isAiChild
		? "of AI usage"
		: getFeatureName({ feature, plural: billingUnits !== 1 }) || "units";
	return { unitName, isAiChild };
};

/** A rate as the rate card reads it, e.g. "2.857 credits" or "3 credits per 10 searches". */
export const creditRateLabel = ({
	rate,
	features,
}: {
	rate: CreditSchemaItem;
	features: Feature[];
}) =>
	creditRateSummary({
		item: rate,
		...rateUnit({
			feature: findFeatureById({
				features,
				featureId: rate.metered_feature_id,
				errorOnNotFound: false,
			}),
			billingUnits: rate.feature_amount,
		}),
	});

/** A covered row's rate, and the credit system's rate it replaced when changed. */
export const rowRateLabels = ({
	row,
	features,
}: {
	row: Exclude<RateCardRow, { state: "excluded" }>;
	features: Feature[];
}) => ({
	rate: creditRateLabel({ rate: row.rate, features }),
	previousRate:
		row.state === "changed"
			? creditRateLabel({ rate: row.catalogRate, features })
			: undefined,
});

/** Old rate with a shared unit dropped, so "3 credits → 2.857 credits" reads "3 → 2.857 credits". */
export const previousRateText = ({
	from,
	to,
}: {
	from: string;
	to: string;
}) => {
	const [amount, ...unit] = from.split(" ");
	return unit.join(" ") === to.split(" ").slice(1).join(" ") ? amount : from;
};

const ratesByFeature = ({
	item,
	features,
}: {
	item: ApiPlanItemV1;
	features: Feature[];
}) => {
	const override = item.feature_override
		? apiFeatureOverrideToDb(item.feature_override)
		: undefined;
	const rows = rateCardRows({
		override: override?.schema ?? [],
		creditSystem: findFeatureById({
			features,
			featureId: item.feature_id,
			errorOnNotFound: false,
		}),
	});
	return new Map(
		rows.map((row) => [
			row.featureId,
			row.state === "excluded" ? null : row.rate,
		]),
	);
};

/** Effective rates that differ between two items, in rate card order; `null` when a
 * changed rate's one-line label can't show the difference (tiers, dimensions). */
export const diffItemRates = ({
	previous,
	next,
	features,
}: {
	previous: ApiPlanItemV1;
	next: ApiPlanItemV1;
	features: Feature[];
}): FeatureRateChange[] | null => {
	const before = ratesByFeature({ item: previous, features });
	const after = ratesByFeature({ item: next, features });
	const label = (rate: CreditSchemaItem | null | undefined) =>
		rate ? creditRateLabel({ rate, features }) : null;
	const changes: FeatureRateChange[] = [];
	for (const featureId of new Set([...after.keys(), ...before.keys()])) {
		const [old, current] = [before.get(featureId), after.get(featureId)];
		if (
			old &&
			current &&
			creditSchemaItemsAreSame({ left: old, right: current })
		)
			continue;
		if (!old && !current) continue;
		const [from, to] = [label(old), label(current)];
		if (from === to) return null;
		changes.push({
			featureId,
			label: featureDisplayName({ features, featureId }),
			from,
			to,
		});
	}
	return changes;
};

const withoutOverride = (item: ApiPlanItemV1) => ({
	...item,
	feature_override: undefined,
});

/** Pulls out added/removed pairs that differ only in their rate card, so each reads as one change. */
export const splitRateCardItemChanges = ({
	itemChanges,
	features,
}: {
	itemChanges: PlanItemChangeV0[];
	features: Feature[];
}) => {
	const paired = new Set<PlanItemChangeV0>();
	const rateCardChanges = itemChanges.flatMap(
		(change): RateCardItemChange[] => {
			if (change.action !== "created") return [];
			const deleted = itemChanges.find(
				(candidate) =>
					candidate.action === "deleted" &&
					!paired.has(candidate) &&
					itemsEqual(
						withoutOverride(change.item),
						withoutOverride(candidate.item),
					),
			);
			if (!deleted) return [];
			const rates = diffItemRates({
				previous: deleted.item,
				next: change.item,
				features,
			});
			if (!rates?.length) return [];
			paired.add(change).add(deleted);
			return [{ change, rates }];
		},
	);

	return {
		rateCardChanges,
		otherChanges: itemChanges.filter((change) => !paired.has(change)),
	};
};
