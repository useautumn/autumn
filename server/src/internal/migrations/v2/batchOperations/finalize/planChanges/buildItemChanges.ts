import type {
	ApiPlanItemV1,
	CustomerPlanItemChange,
	EntitlementWithFeature,
	Feature,
} from "@autumn/shared";
import {
	composeMatchKey,
	itemsEqual,
	productItemsToPlanItemsV1,
	toProductItem,
} from "@autumn/shared";
import { buildPlanItemChangesFromLists } from "@/internal/catalogV2/actions/buildPlanChange/index.js";

export type EntitlementChange = {
	entitlement: EntitlementWithFeature;
	action: "created" | "deleted";
};

const entitlementsToPlanItems = ({
	entitlements,
	features,
}: {
	entitlements: EntitlementWithFeature[];
	features: Feature[];
}) =>
	productItemsToPlanItemsV1({
		items: entitlements.map((entitlement) =>
			toProductItem({ ent: entitlement }),
		),
		features,
	});

/** Definition repoints replace rows without changing content; identical
 * matched pairs cancel so the diff matches diffPlanV1's semantics. */
const withoutIdenticalPairs = ({
	createdItems,
	deletedItems,
}: {
	createdItems: ApiPlanItemV1[];
	deletedItems: ApiPlanItemV1[];
}) => {
	const deletedByKey = new Map(
		deletedItems.map((item) => [composeMatchKey(item), item]),
	);
	const isUnchanged = (created: ApiPlanItemV1) => {
		const deleted = deletedByKey.get(composeMatchKey(created));
		return deleted !== undefined && itemsEqual(deleted, created);
	};
	const unchangedKeys = new Set(
		createdItems.filter(isUnchanged).map(composeMatchKey),
	);

	return {
		createdItems: createdItems.filter(
			(item) => !unchangedKeys.has(composeMatchKey(item)),
		),
		deletedItems: deletedItems.filter(
			(item) => !unchangedKeys.has(composeMatchKey(item)),
		),
	};
};

export const buildItemChanges = ({
	changes,
	features,
}: {
	changes: EntitlementChange[];
	features: Feature[];
}): CustomerPlanItemChange[] => {
	const createdEntitlements: EntitlementWithFeature[] = [];
	const deletedEntitlements: EntitlementWithFeature[] = [];
	for (const change of changes) {
		const destination =
			change.action === "created" ? createdEntitlements : deletedEntitlements;
		destination.push(change.entitlement);
	}

	return buildPlanItemChangesFromLists(
		withoutIdenticalPairs({
			createdItems: entitlementsToPlanItems({
				entitlements: createdEntitlements,
				features,
			}),
			deletedItems: entitlementsToPlanItems({
				entitlements: deletedEntitlements,
				features,
			}),
		}),
	);
};
