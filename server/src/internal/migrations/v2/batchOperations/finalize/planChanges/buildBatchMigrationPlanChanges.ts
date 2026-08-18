import {
	type EntitlementWithFeature,
	type Feature,
	isOneOffProduct,
} from "@autumn/shared";
import type { CustomerPlanChange } from "@autumn/shared/api/billing/common/customerPlanChange.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationPageResult,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "../../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../../types/index.js";
import { migratedProductToPlanChange } from "./migratedProductToPlanChange.js";

export type ChangedItem = (
	| (BatchMigrationInsertedItem & { action: "created" })
	| (BatchMigrationRemovedItem & { action: "deleted" })
) & { entityId: string | null };

export const toChangedItems = ({
	insertedItems,
	removedItems,
}: Pick<
	BatchMigrationPageResult,
	"insertedItems" | "removedItems"
>): ChangedItem[] => [
	...insertedItems.map((item) => ({ ...item, action: "created" as const })),
	...removedItems.map((item) => ({ ...item, action: "deleted" as const })),
];

export type BatchMigrationPlanChangeEntry = {
	internalCustomerId: string;
	entityId: string | null;
	customerProductId: string;
	planChange: CustomerPlanChange;
};

export const buildEntitlementLookup = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}): Map<string, EntitlementWithFeature> =>
	new Map(
		plan.patches.flatMap((patch) => [
			...patch.addEntitlementOps.map(
				(add): [string, EntitlementWithFeature] => [
					`${patch.fromProduct.id}:${add.entitlement.feature.id}`,
					add.entitlement,
				],
			),
			...patch.replaceEntitlementOps.map(
				(replace): [string, EntitlementWithFeature] => [
					`${patch.fromProduct.id}:${replace.entitlement.feature.id}`,
					replace.entitlement,
				],
			),
			// License rows key on their own plan, not the parent the patch filtered on.
			...patch.licenseEntitlementOps.flatMap(
				(operation): [string, EntitlementWithFeature][] =>
					"entitlement" in operation
						? [
								[
									`${operation.licensePlanId}:${operation.entitlement.feature.id}`,
									operation.entitlement,
								],
							]
						: [],
			),
		]),
	);

const buildOneOffByPlanId = ({
	plan,
}: {
	plan: BatchMigrationExecutionPlan;
}): Map<string, boolean> =>
	new Map(
		plan.patches.flatMap((patch): [string, boolean][] => [
			[
				patch.fromProduct.id,
				isOneOffProduct({ prices: patch.fromProduct.prices }),
			],
			...patch.licenseEntitlementOps.map((operation): [string, boolean] => [
				operation.licensePlanId,
				operation.isOneOff,
			]),
		]),
	);

const groupChangedItemsByCustomerProduct = ({
	items,
}: {
	items: ChangedItem[];
}): Map<string, ChangedItem[]> => {
	const grouped = new Map<string, ChangedItem[]>();
	for (const item of items) {
		const group = grouped.get(item.customerProductId) ?? [];
		group.push(item);
		grouped.set(item.customerProductId, group);
	}
	return grouped;
};

const toPlanChangeEntry = ({
	customerProductId,
	appliedItems,
	repointed,
	oneOffByPlanId,
	entitlementLookup,
	features,
}: {
	customerProductId: string;
	appliedItems: ChangedItem[];
	repointed: BatchMigrationRepointedProduct | undefined;
	oneOffByPlanId: Map<string, boolean>;
	entitlementLookup: Map<string, EntitlementWithFeature>;
	features: Feature[];
}): BatchMigrationPlanChangeEntry | undefined => {
	if (repointed) {
		const planChange = migratedProductToPlanChange({
			planId: repointed.toProduct.id,
			isOneOff: isOneOffProduct(repointed.toProduct),
			lifecycle: {
				status: repointed.status,
				startsAt: repointed.startsAt,
				canceledAt: repointed.canceledAt,
				endedAt: repointed.endedAt,
				trialEndsAt: repointed.trialEndsAt,
			},
			repoint: {
				fromProduct: repointed.fromProduct,
				toProduct: repointed.toProduct,
			},
			appliedItems,
			entitlementLookup,
			features,
		});
		if (!planChange) return undefined;

		return {
			internalCustomerId: repointed.internalCustomerId,
			entityId: repointed.entityId,
			customerProductId,
			planChange,
		};
	}

	const [first] = appliedItems;
	if (!first) return undefined;

	const planChange = migratedProductToPlanChange({
		planId: first.planId,
		isOneOff: oneOffByPlanId.get(first.planId) ?? false,
		lifecycle: {
			status: first.status,
			startsAt: first.startsAt,
			canceledAt: first.canceledAt,
			endedAt: first.endedAt,
			trialEndsAt: first.trialEndsAt,
		},
		appliedItems,
		entitlementLookup,
		features,
	});
	if (!planChange) return undefined;

	return {
		internalCustomerId: first.internalCustomerId,
		entityId: first.entityId,
		customerProductId,
		planChange,
	};
};

export const buildBatchMigrationPlanChanges = ({
	pageResult,
	plan,
	features,
}: {
	pageResult: BatchMigrationPageResult;
	plan: BatchMigrationExecutionPlan;
	features: Feature[];
}): BatchMigrationPlanChangeEntry[] => {
	const entitlementLookup = buildEntitlementLookup({ plan });
	const oneOffByPlanId = buildOneOffByPlanId({ plan });
	const itemsByCustomerProduct = groupChangedItemsByCustomerProduct({
		items: toChangedItems(pageResult),
	});
	const repointsByCustomerProduct = new Map(
		(pageResult.repointedProducts ?? []).map((product) => [
			product.customerProductId,
			product,
		]),
	);

	const customerProductIds = new Set([
		...repointsByCustomerProduct.keys(),
		...itemsByCustomerProduct.keys(),
	]);

	return [...customerProductIds].flatMap((customerProductId) => {
		const entry = toPlanChangeEntry({
			customerProductId,
			appliedItems: itemsByCustomerProduct.get(customerProductId) ?? [],
			repointed: repointsByCustomerProduct.get(customerProductId),
			oneOffByPlanId,
			entitlementLookup,
			features,
		});
		return entry ? [entry] : [];
	});
};
