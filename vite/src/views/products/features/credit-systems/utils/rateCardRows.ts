import {
	type ApiPlanItemV1,
	apiFeatureOverrideToDb,
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	creditSchemaItemsAreSame,
	type Feature,
	findFeatureById,
	isExcludedCreditSchemaItem,
	itemsEqual,
	type PlanItemChangeV0,
} from "@autumn/shared";
import {
	effectiveSchemaToOverride,
	overrideToEffectiveSchema,
} from "./creditOverrideSchema";
import { rateText } from "./creditRateSummary";

/** One feature of a plan's effective rate card and where its rate comes from. */
export type RateCardRow = { featureId: string } & (
	| { state: "inherited"; rate: CreditSchemaItem }
	| { state: "changed"; rate: CreditSchemaItem; catalogRate: CreditSchemaItem }
	| { state: "excluded"; catalogRate: CreditSchemaItem }
	| { state: "added"; rate: CreditSchemaItem }
);

/** Catalog rows in the credit system's order, removed ones in place, then features the plan adds. */
export const rateCardRows = ({
	override,
	catalog,
}: {
	override: CreditSchemaOverrideItem[];
	catalog: CreditSchemaItem[];
}): RateCardRow[] => {
	const byFeature = new Map(
		override.map((row) => [row.metered_feature_id, row]),
	);
	const catalogIds = new Set(catalog.map((row) => row.metered_feature_id));
	return [
		...catalog.map((catalogRate): RateCardRow => {
			const featureId = catalogRate.metered_feature_id;
			const row = byFeature.get(featureId);
			if (row && isExcludedCreditSchemaItem(row))
				return { featureId, state: "excluded", catalogRate };
			if (!row || creditSchemaItemsAreSame({ left: row, right: catalogRate }))
				return { featureId, state: "inherited", rate: catalogRate };
			return { featureId, state: "changed", rate: row, catalogRate };
		}),
		...override.flatMap((row): RateCardRow[] =>
			catalogIds.has(row.metered_feature_id) || isExcludedCreditSchemaItem(row)
				? []
				: [{ featureId: row.metered_feature_id, state: "added", rate: row }],
		),
	];
};

/** Features a plan can add: anything not already on its rate card, so excluded rows come back only through Restore. */
export const addableFeatures = ({
	features,
	rows,
}: {
	features: Feature[];
	rows: RateCardRow[];
}) => features.filter((f) => !rows.some((row) => row.featureId === f.id));

/** "From Demo credits · 1 changed · 1 not covered", skipping counts that are zero. */
export const rateCardSubtitle = ({
	creditSystemName,
	rows,
}: {
	creditSystemName: string;
	rows: RateCardRow[];
}) =>
	Object.entries({
		changed: "changed",
		added: "added",
		excluded: "not covered",
	})
		.map(([state, label]) => [
			rows.filter((r) => r.state === state).length,
			label,
		])
		.reduce(
			(text, [n, label]) => (n ? `${text} · ${n} ${label}` : text),
			`From ${creditSystemName}`,
		);

const withoutOverride = (item: ApiPlanItemV1) => ({
	...item,
	feature_override: undefined,
});

/** Added/removed pairs that differ only in their rate card, as the changed rows of the new card
 * measured against the old one; a change the one-line rate text can't show stays a pair. */
export const rateCardItemChanges = ({
	itemChanges,
	features,
}: {
	itemChanges: PlanItemChangeV0[];
	features: Feature[];
}) => {
	const paired = new Set<PlanItemChangeV0>();
	const rateCardChanges = itemChanges.flatMap((created) => {
		const deleted = itemChanges.find(
			(c) =>
				created.action === "created" &&
				c.action === "deleted" &&
				!paired.has(c) &&
				itemsEqual(withoutOverride(created.item), withoutOverride(c.item)),
		);
		const creditSystem = findFeatureById({
			features,
			featureId: created.feature_id,
			errorOnNotFound: false,
		});
		if (!deleted || !creditSystem) return [];
		const effective = ({ item }: PlanItemChangeV0) =>
			overrideToEffectiveSchema({
				override: item.feature_override
					? (apiFeatureOverrideToDb(item.feature_override).schema ?? [])
					: [],
				creditSystem,
			});
		const before = effective(deleted);
		const rows = rateCardRows({
			catalog: before,
			override: effectiveSchemaToOverride({
				schema: effective(created),
				catalog: before,
			}),
		}).filter((row) => row.state !== "inherited");
		const unreadable = rows.some(
			(row) =>
				row.state === "changed" &&
				rateText({ rate: row.rate, features }) ===
					rateText({ rate: row.catalogRate, features }),
		);
		if (!rows.length || unreadable) return [];
		paired.add(created).add(deleted);
		return [{ change: created, rows }];
	});
	return {
		rateCardChanges,
		otherChanges: itemChanges.filter((c) => !paired.has(c)),
	};
};
