import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	diffPlanV1ItemChanges,
	type PlanItemChangeV0,
} from "@autumn/shared";

export const buildPlanItemChangesFromDiff = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): PlanItemChangeV0[] => diffPlanV1ItemChanges({ from, to });

export const buildPlanItemChangesFromLists = ({
	createdItems,
	deletedItems,
}: {
	createdItems: ApiPlanItemV1[];
	deletedItems: ApiPlanItemV1[];
}): PlanItemChangeV0[] => [
	...deletedItems.map((item) => ({
		action: "deleted" as const,
		feature_id: item.feature_id,
		item,
	})),
	...createdItems.map((item) => ({
		action: "created" as const,
		feature_id: item.feature_id,
		item,
	})),
];
