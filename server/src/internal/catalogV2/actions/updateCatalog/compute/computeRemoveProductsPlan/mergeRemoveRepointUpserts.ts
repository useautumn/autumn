import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { intentToUpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeUpsertProductPlan/intentToUpsertProductPlan";
import type { ProjectedCatalog } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemovePlanPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const rowKey = ({
	planId,
	version,
}: {
	planId: string;
	version: number;
}): string => `${planId}:${version}`;

const planIdForInternalId = ({
	internalId,
	removePlans,
	projected,
}: {
	internalId: string;
	removePlans: RemovePlanPlan[];
	projected: ProjectedCatalog;
}): string | undefined =>
	removePlans.find((row) => row.current?.internal_id === internalId)?.planId ??
	projected.products.find((product) => product.internal_id === internalId)?.id;

const highestSurvivingBase = ({
	planId,
	projected,
	hardDeletedInternalIds,
	archivedInternalIds,
}: {
	planId: string;
	projected: ProjectedCatalog;
	hardDeletedInternalIds: Set<string>;
	archivedInternalIds: Set<string>;
}): FullProduct | undefined =>
	projected.products
		.filter(
			(product) =>
				product.id === planId &&
				!product.archived &&
				!hardDeletedInternalIds.has(product.internal_id) &&
				!archivedInternalIds.has(product.internal_id),
		)
		.sort((left, right) => right.version - left.version)[0];

const stampRepointOnUpsert = ({
	upsert,
	baseInternalProductId,
}: {
	upsert: UpsertProductPlan;
	baseInternalProductId: string;
}): UpsertProductPlan => {
	const nextFullProduct = {
		...upsert.row.nextFullProduct,
		base_internal_product_id: baseInternalProductId,
	};
	const previousPointer =
		upsert.row.currentFullProduct?.base_internal_product_id ??
		upsert.row.nextFullProduct.base_internal_product_id;
	return {
		...upsert,
		row: {
			...upsert.row,
			op: upsert.row.op === "create" ? "create" : "update",
			nextFullProduct,
		},
		details: {
			changed: true,
			product: {
				...(upsert.details?.product ?? upsert.row.nextFullProduct),
				base_internal_product_id: baseInternalProductId,
			},
			previousAttributes: {
				...upsert.details?.previousAttributes,
				base_internal_product_id: previousPointer,
			},
		},
	};
};

/**
 * Variants pointing at a removed/archived base row get a `source: "repoint"`
 * upsert onto the highest remaining live version. Same array if nothing moves.
 */
export const mergeRemoveRepointUpserts = ({
	ctx,
	catalogContext,
	removePlans,
	projected,
	existingUpserts,
}: {
	ctx: AutumnContext;
	catalogContext: UpdateCatalogContext;
	removePlans: RemovePlanPlan[];
	projected: ProjectedCatalog;
	existingUpserts: UpsertProductPlan[];
}): UpsertProductPlan[] => {
	const hardDeletedInternalIds = new Set(
		removePlans.flatMap((row) =>
			row.current && !row.willArchive ? [row.current.internal_id] : [],
		),
	);
	const archivedInternalIds = new Set(
		removePlans.flatMap((row) =>
			row.current && row.willArchive ? [row.current.internal_id] : [],
		),
	);
	const removedPointerIds = new Set([
		...hardDeletedInternalIds,
		...archivedInternalIds,
	]);
	if (removedPointerIds.size === 0) return existingUpserts;

	const upsertsByRow = new Map(
		existingUpserts.map((upsert) => [
			rowKey({ planId: upsert.row.planId, version: upsert.row.version }),
			upsert,
		]),
	);
	let changed = false;

	for (const product of projected.products) {
		const pointer = product.base_internal_product_id;
		if (!pointer || !removedPointerIds.has(pointer)) continue;
		if (hardDeletedInternalIds.has(product.internal_id)) continue;

		const basePlanId = planIdForInternalId({
			internalId: pointer,
			removePlans,
			projected,
		});
		if (!basePlanId) continue;

		const surviving = highestSurvivingBase({
			planId: basePlanId,
			projected,
			hardDeletedInternalIds,
			archivedInternalIds,
		});
		if (!surviving || pointer === surviving.internal_id) continue;

		const key = rowKey({ planId: product.id, version: product.version });
		const existing = upsertsByRow.get(key);
		upsertsByRow.set(
			key,
			existing
				? stampRepointOnUpsert({
						upsert: existing,
						baseInternalProductId: surviving.internal_id,
					})
				: intentToUpsertProductPlan({
						ctx,
						productStatesContext: catalogContext.productStatesContext,
						intent: {
							productKey: {
								planId: product.id,
								version: product.version,
							},
							planParams: {
								plan_id: product.id,
								version: product.version,
							},
							source: "repoint",
							baseInternalProductId: surviving.internal_id,
						},
					}),
		);
		changed = true;
	}

	return changed ? [...upsertsByRow.values()] : existingUpserts;
};
