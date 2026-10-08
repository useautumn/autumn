import type { MigrationItemChange } from "@autumn/shared";
import type { BatchMigrationChanges } from "../execute/types/batchMigrationChanges.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";
import { planSnapshots } from "./planSnapshots.js";

type CustomerChange = {
	internalCustomerId: string;
	change: MigrationItemChange;
};

/** Each row an op reported becomes one self-describing change on its customer. */
export const toMigrationItemChanges = ({
	insertedItems = [],
	removedItems = [],
	repointedProducts = [],
	repointedPoolCustomerIds = [],
	plan = { patches: [] },
}: BatchMigrationChanges & {
	plan?: BatchMigrationExecutionPlan;
}): Map<string, MigrationItemChange[]> => {
	const snapshots = planSnapshots({ plan });

	return groupByCustomer([
		...insertedItems.map(({ internalCustomerId, ...item }) => ({
			internalCustomerId,
			change: {
				kind: "entitlement_created" as const,
				...item,
				entitlement: snapshots.entitlement(item),
				isOneOff: snapshots.isOneOff(item),
			},
		})),
		...removedItems.map(({ internalCustomerId, ...item }) => ({
			internalCustomerId,
			change: {
				kind: "entitlement_deleted" as const,
				...item,
				isOneOff: snapshots.isOneOff(item),
			},
		})),
		...repointedProducts.map(({ internalCustomerId, ...product }) => ({
			internalCustomerId,
			change: { kind: "customer_product_repointed" as const, ...product },
		})),
		...repointedPoolCustomerIds.map((internalCustomerId) => ({
			internalCustomerId,
			change: { kind: "license_pool_repointed" as const },
		})),
	]);
};

const groupByCustomer = (
	customerChanges: CustomerChange[],
): Map<string, MigrationItemChange[]> => {
	const byCustomer = new Map<string, MigrationItemChange[]>();
	for (const { internalCustomerId, change } of customerChanges)
		byCustomer.set(internalCustomerId, [
			...(byCustomer.get(internalCustomerId) ?? []),
			change,
		]);
	return byCustomer;
};
