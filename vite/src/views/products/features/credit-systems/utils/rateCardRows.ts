import {
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	creditSchemaItemsAreSame,
	type Feature,
	findFeatureById,
	getFeatureName,
	isAiCreditSystem,
	isExcludedCreditSchemaItem,
} from "@autumn/shared";
import { creditRateSummary } from "./creditRateSummary";

export type RateCardRowState = "inherited" | "changed" | "excluded" | "added";

/** One feature of a plan's effective rate card and where its rate comes from. */
export type RateCardRow =
	| { featureId: string; state: "inherited"; rate: CreditSchemaItem }
	| {
			featureId: string;
			state: "changed";
			rate: CreditSchemaItem;
			catalogRate: CreditSchemaItem;
	  }
	| { featureId: string; state: "excluded"; catalogRate: CreditSchemaItem }
	| { featureId: string; state: "added"; rate: CreditSchemaItem };

export type RateCardSummary = {
	rows: RateCardRow[];
	changedCount: number;
	addedCount: number;
	excludedCount: number;
};

const classifyCatalogRow = ({
	catalogRate,
	overrideRow,
}: {
	catalogRate: CreditSchemaItem;
	overrideRow: CreditSchemaOverrideItem | undefined;
}): RateCardRow => {
	const featureId = catalogRate.metered_feature_id;
	if (!overrideRow) return { featureId, state: "inherited", rate: catalogRate };
	if (isExcludedCreditSchemaItem(overrideRow))
		return { featureId, state: "excluded", catalogRate };
	if (creditSchemaItemsAreSame({ left: overrideRow, right: catalogRate }))
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
}): RateCardSummary => {
	const catalogSchema: CreditSchemaItem[] = creditSystem?.config?.schema ?? [];
	const overrideByFeature = new Map(
		override.map((row) => [row.metered_feature_id, row]),
	);
	const catalogFeatureIds = new Set(
		catalogSchema.map((row) => row.metered_feature_id),
	);

	const rows: RateCardRow[] = [
		...catalogSchema.map((catalogRate) =>
			classifyCatalogRow({
				catalogRate,
				overrideRow: overrideByFeature.get(catalogRate.metered_feature_id),
			}),
		),
		...override.flatMap((row): RateCardRow[] =>
			catalogFeatureIds.has(row.metered_feature_id) ||
			isExcludedCreditSchemaItem(row)
				? []
				: [{ featureId: row.metered_feature_id, state: "added", rate: row }],
		),
	];

	const countOf = (state: RateCardRowState) =>
		rows.filter((row) => row.state === state).length;

	return {
		rows,
		changedCount: countOf("changed"),
		addedCount: countOf("added"),
		excludedCount: countOf("excluded"),
	};
};

/** "From Demo credits · 1 changed · 1 not covered", skipping counts that are zero. */
export const rateCardSubtitle = ({
	creditSystemName,
	summary,
}: {
	creditSystemName: string;
	summary: RateCardSummary;
}) =>
	[
		`From ${creditSystemName}`,
		summary.changedCount > 0 && `${summary.changedCount} changed`,
		summary.addedCount > 0 && `${summary.addedCount} added`,
		summary.excludedCount > 0 && `${summary.excludedCount} not covered`,
	]
		.filter(Boolean)
		.join(" · ");

/** A rate as the rate card reads it, e.g. "2.857 credits" or "3 credits per 10 searches". */
export const creditRateLabel = ({
	rate,
	features,
}: {
	rate: CreditSchemaItem;
	features: Feature[];
}) => {
	const feature = findFeatureById({
		features,
		featureId: rate.metered_feature_id,
		errorOnNotFound: false,
	});
	const isAiChild = isAiCreditSystem(feature?.type);
	const unitName = isAiChild
		? "of AI usage"
		: getFeatureName({
				feature,
				plural: (rate.feature_amount ?? 1) !== 1,
				capitalize: false,
			}) || "units";
	return creditRateSummary({ item: rate, unitName, isAiChild });
};

const splitLeadingAmount = (text: string) => {
	const [amount, ...rest] = text.split(" ");
	return { amount, unit: rest.join(" ") };
};

/** Old and new rate with a shared unit written once: "3 → 2.857 credits", matching the migration diffs. */
export const rateChangeParts = ({ from, to }: { from: string; to: string }) => {
	const before = splitLeadingAmount(from);
	const after = splitLeadingAmount(to);
	if (before.unit === after.unit) return { from: before.amount, to };
	return { from, to };
};

/** The credit system's own rate for a row, which edits are measured against. */
export const catalogRateOf = (
	row: RateCardRow,
): CreditSchemaItem | undefined => {
	if (row.state === "inherited") return row.rate;
	if (row.state === "added") return undefined;
	return row.catalogRate;
};
