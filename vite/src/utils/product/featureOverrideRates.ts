import {
	apiFeatureOverrideToDb,
	type CreditSchemaItem,
	entitlementToCreditSystem,
	type Feature,
	type FeatureConfigOverride,
	findFeatureById,
	hasCreditDimensionRules,
	isExcludedCreditSchemaItem,
	numberWithCommas,
	type UpdatePlanOp,
} from "@autumn/shared";
import { featureDisplayName } from "@/views/products/features/credit-systems/utils/featureDisplayName";

type Customize = NonNullable<UpdatePlanOp["customize"]>;
type AddItem = NonNullable<Customize["add_items"]>[number];
type RemoveFilter = NonNullable<Customize["remove_items"]>[number];

/** A flat rate's old → new credits; with no `to`, a rate the card can't summarise changed. */
export type RateChange = {
	key: string;
	label: string;
	meteredFeatureId?: string;
	from?: string;
	to?: string;
};
/** `updated`: the add and its paired remove are one item whose rates alone changed. */
export type ItemRateRow = ReturnType<
	typeof migrationOpRateRows
>["rows"][number];

/** Flat per-feature costs of the card customers get, plus everything else as one comparable string. */
const rateCard = (override: FeatureConfigOverride, creditSystem?: Feature) => {
	const schema: CreditSchemaItem[] = creditSystem
		? entitlementToCreditSystem({
				entitlement: { feature: creditSystem, feature_override: override },
			}).config.schema
		: (override.schema ?? []).filter(
				(row): row is CreditSchemaItem => !isExcludedCreditSchemaItem(row),
			);
	// A per-units rate (feature_amount) isn't flat, so a change to it shows as "Rate card changed".
	const isFlat = (item: CreditSchemaItem) =>
		!item.tiers &&
		!hasCreditDimensionRules(item) &&
		(item.feature_amount ?? 1) === 1;
	const flat = schema.filter(isFlat);
	return {
		flat: new Map(
			flat.map((i) => [i.metered_feature_id, i.credit_amount ?? 0]),
		),
		rest: JSON.stringify([schema.filter((i) => !isFlat(i)), override.markups]),
	};
};

const sameCadence = (add: AddItem, remove: RemoveFilter) =>
	String(add.price?.interval ?? add.reset?.interval) ===
		String(remove.interval) &&
	(add.price?.interval_count ?? add.reset?.interval_count ?? 1) ===
		(remove.interval_count ?? 1);

/** Pairs each add with the remove it replaces and diffs their rates; with no stamp, the new card shows alone. */
export const migrationOpRateRows = ({
	op,
	features,
}: {
	op: UpdatePlanOp;
	features: Feature[];
}) => {
	const removes = op.customize?.remove_items ?? [];
	const taken = new Set<number>();
	const rows = (op.customize?.add_items ?? []).map((add, addIndex) => {
		const candidates = removes.flatMap((remove, index) =>
			remove.feature_id === add.feature_id && !taken.has(index) ? [index] : [],
		);
		const removeIndex =
			candidates.find((index) => sameCadence(add, removes[index])) ??
			(candidates.length === 1 ? candidates[0] : undefined);
		if (removeIndex !== undefined) taken.add(removeIndex);
		const remove = removeIndex === undefined ? undefined : removes[removeIndex];
		const stamp = remove?.previous_feature_override;
		const creditSystem = findFeatureById({
			features,
			featureId: add.feature_id,
			errorOnNotFound: false,
		});
		// An empty stamp means the old item inherited the credit system's rates, and so does a cleared override.
		const before = stamp
			? rateCard(apiFeatureOverrideToDb(stamp), creditSystem)
			: undefined;
		const next = apiFeatureOverrideToDb(add.feature_override ?? {});
		const after = rateCard(next, stamp ? creditSystem : undefined);
		const changes: RateChange[] = [...after.flat].flatMap(
			([featureId, cost]) => {
				const from = before?.flat.get(featureId);
				if (from === cost) return [];
				return [
					{
						key: featureId,
						meteredFeatureId: featureId,
						label: featureDisplayName({ features, featureId, plural: true }),
						from: from === undefined ? undefined : numberWithCommas(from),
						to: numberWithCommas(cost),
					},
				];
			},
		);
		const removedFlat = [...(before?.flat.keys() ?? [])].some(
			(featureId) => !after.flat.has(featureId),
		);
		if (removedFlat || after.rest !== (before?.rest ?? rateCard({}).rest))
			changes.push({ key: "rate-card", label: "Rate card changed" });
		const updated =
			remove !== undefined &&
			!!stamp &&
			changes.length > 0 &&
			!add.price &&
			remove.billing_method === undefined &&
			remove.included === add.included &&
			sameCadence(add, remove);
		return { addIndex, removeIndex, changes, updated };
	});
	const mergedRemoveIndices = new Set(
		rows.flatMap((row) => (row.updated ? [row.removeIndex as number] : [])),
	);
	return { rows, mergedRemoveIndices };
};
