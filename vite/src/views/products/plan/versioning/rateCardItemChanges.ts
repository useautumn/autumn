import {
	type ApiPlanItemV1,
	apiFeatureOverrideToDb,
	type Feature,
	findFeatureById,
	itemsEqual,
	type PlanItemChangeV0,
} from "@autumn/shared";
import { featureDisplayName } from "@/views/products/features/credit-systems/utils/featureDisplayName";
import {
	creditRateLabel,
	rateCardRows,
} from "@/views/products/features/credit-systems/utils/rateCardRows";

/** One feature's rate before and after; `null` means the feature is not covered on that side. */
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

const rateLabelsByFeature = ({
	item,
	features,
}: {
	item: ApiPlanItemV1;
	features: Feature[];
}) => {
	const override = item.feature_override
		? apiFeatureOverrideToDb(item.feature_override)
		: undefined;
	const { rows } = rateCardRows({
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
			row.state === "excluded"
				? null
				: creditRateLabel({ rate: row.rate, features }),
		]),
	);
};

/** Effective rates that differ between two items of one credit system, in rate card order. */
export const diffItemRates = ({
	previous,
	next,
	features,
}: {
	previous: ApiPlanItemV1;
	next: ApiPlanItemV1;
	features: Feature[];
}): FeatureRateChange[] => {
	const before = rateLabelsByFeature({ item: previous, features });
	const after = rateLabelsByFeature({ item: next, features });
	const featureIds = [...new Set([...after.keys(), ...before.keys()])];

	return featureIds.flatMap((featureId) => {
		const from = before.get(featureId) ?? null;
		const to = after.get(featureId) ?? null;
		if (from === to) return [];
		return [
			{
				featureId,
				label: featureDisplayName({ features, featureId }),
				from,
				to,
			},
		];
	});
};

const onlyRateCardChanged = ({
	created,
	deleted,
}: {
	created: ApiPlanItemV1;
	deleted: ApiPlanItemV1;
}) =>
	itemsEqual(
		{ ...created, feature_override: undefined },
		{ ...deleted, feature_override: undefined },
	);

/** Pulls out added/removed pairs that differ only in their rate card, so each reads as one change. */
export const splitRateCardItemChanges = ({
	itemChanges,
	features,
}: {
	itemChanges: PlanItemChangeV0[];
	features: Feature[];
}): {
	rateCardChanges: RateCardItemChange[];
	otherChanges: PlanItemChangeV0[];
} => {
	const paired = new Set<PlanItemChangeV0>();
	const rateCardChanges = itemChanges.flatMap((change) => {
		if (change.action !== "created") return [];
		const deleted = itemChanges.find(
			(candidate) =>
				candidate.action === "deleted" &&
				!paired.has(candidate) &&
				onlyRateCardChanged({ created: change.item, deleted: candidate.item }),
		);
		if (!deleted) return [];
		const rates = diffItemRates({
			previous: deleted.item,
			next: change.item,
			features,
		});
		if (rates.length === 0) return [];
		paired.add(change).add(deleted);
		return [{ change, rates }];
	});

	return {
		rateCardChanges,
		otherChanges: itemChanges.filter((change) => !paired.has(change)),
	};
};
