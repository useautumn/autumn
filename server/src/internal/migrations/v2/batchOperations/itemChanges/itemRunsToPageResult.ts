import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
	MigrationItemChange,
} from "@autumn/shared";
import { MigrationItemRunStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import type { ItemRunToPublish } from "../execute/claim/listItemRunsToPublish.js";
import type { BatchMigrationPageResult } from "../execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationExecutionPlan } from "../types/index.js";

type CustomerChange = {
	internalCustomerId: string;
	change: MigrationItemChange;
};

/** Rebuilds the page result the finalize builders read from settled item runs'
 * recorded changes, reloading the definitions and products stored as ids. */
export const itemRunsToPageResult = async ({
	ctx,
	plan,
	itemRuns,
}: {
	ctx: AutumnContext;
	plan: BatchMigrationExecutionPlan;
	itemRuns: ItemRunToPublish[];
}): Promise<BatchMigrationPageResult> => {
	const succeeded = itemRuns.filter(
		(itemRun) => itemRun.status === MigrationItemRunStatus.Succeeded,
	);
	const skipped = itemRuns.filter(
		(itemRun) => itemRun.status === MigrationItemRunStatus.Skipped,
	);
	const changes: CustomerChange[] = succeeded.flatMap((itemRun) =>
		(itemRun.changes ?? []).map((change) => ({
			internalCustomerId: itemRun.customer.internalId,
			change,
		})),
	);
	const entitlementById = await loadDeletedEntitlements({ ctx, changes });
	const productByInternalId = await loadRepointedProducts({
		ctx,
		plan,
		changes,
	});

	const result: BatchMigrationPageResult = {
		succeeded: succeeded.map((itemRun) => itemRun.customer),
		skipped: skipped.map((itemRun) => itemRun.customer),
		skipReasons: Object.fromEntries(
			skipped.flatMap((itemRun) =>
				itemRun.skipReason
					? [[itemRun.customer.internalId, itemRun.skipReason]]
					: [],
			),
		),
		insertedItems: [],
		removedItems: [],
		repointedProducts: [],
	};
	for (const { internalCustomerId, change } of changes) {
		switch (change.kind) {
			case "entitlement_created": {
				const { kind: _, ...item } = change;
				result.insertedItems.push({ internalCustomerId, ...item });
				break;
			}
			case "entitlement_deleted": {
				const { kind: _, entitlementId, ...item } = change;
				result.removedItems.push({
					internalCustomerId,
					entitlement: entitlementById(entitlementId),
					...item,
				});
				break;
			}
			case "customer_product_repointed": {
				const {
					kind: _,
					fromInternalProductId,
					toInternalProductId,
					...product
				} = change;
				result.repointedProducts?.push({
					internalCustomerId,
					fromProduct: productByInternalId(fromInternalProductId),
					toProduct: productByInternalId(toInternalProductId),
					...product,
				});
				break;
			}
			case "license_pool_repointed":
				break;
		}
	}
	return result;
};

/** Removed rows point at the customer's own live definition, which the
 * migration plan does not carry. */
const loadDeletedEntitlements = async ({
	ctx,
	changes,
}: {
	ctx: AutumnContext;
	changes: CustomerChange[];
}): Promise<(id: string) => EntitlementWithFeature> => {
	const ids = new Set(
		changes.flatMap(({ change }) =>
			change.kind === "entitlement_deleted" ? [change.entitlementId] : [],
		),
	);
	const entitlements = await EntitlementService.getByIds({
		db: ctx.db,
		ids: [...ids],
	});
	const byId = new Map(
		entitlements.map((entitlement) => [entitlement.id, entitlement]),
	);
	return (id) => {
		const entitlement = byId.get(id);
		if (!entitlement)
			throw new Error(
				`batch-migration: cannot publish a change to deleted entitlement definition ${id}`,
			);
		return entitlement;
	};
};

/** The plan carries the repoint's products; a retry under an edited plan
 * falls back to loading them. */
const loadRepointedProducts = async ({
	ctx,
	plan,
	changes,
}: {
	ctx: AutumnContext;
	plan: BatchMigrationExecutionPlan;
	changes: CustomerChange[];
}): Promise<(internalId: string) => FullProductWithoutLicenses> => {
	const byInternalId = new Map<string, FullProductWithoutLicenses>(
		plan.patches.flatMap((patch) =>
			[patch.fromProduct, patch.toProduct].flatMap((product) =>
				product ? [[product.internal_id, product] as const] : [],
			),
		),
	);
	const missing = new Set(
		changes.flatMap(({ change }) =>
			change.kind === "customer_product_repointed"
				? [change.fromInternalProductId, change.toInternalProductId].filter(
						(internalId) => !byInternalId.has(internalId),
					)
				: [],
		),
	);
	for (const internalId of missing)
		byInternalId.set(
			internalId,
			await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: internalId,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		);
	return (internalId) => {
		const product = byInternalId.get(internalId);
		if (!product)
			throw new Error(
				`batch-migration: cannot publish a repoint to unknown product ${internalId}`,
			);
		return product;
	};
};
