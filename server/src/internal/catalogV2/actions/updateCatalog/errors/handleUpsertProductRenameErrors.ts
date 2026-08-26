import {
	ErrCode,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { hasVercelCustomerOnProduct } from "@/internal/customers/cusProducts/repos/hasVercelCustomerOnProduct";

type RenameTarget = {
	fromId: string;
	toId: string;
};

const renameTargetsFromParams = ({
	params,
}: {
	params: UpdateCatalogParams;
}): RenameTarget[] =>
	params.plans.flatMap((planParams) => [
		...(planParams.new_plan_id && planParams.new_plan_id !== planParams.plan_id
			? [{ fromId: planParams.plan_id, toId: planParams.new_plan_id }]
			: []),
		...(planParams.variants ?? []).flatMap((variant) =>
			variant.new_plan_id && variant.new_plan_id !== variant.variant_plan_id
				? [{ fromId: variant.variant_plan_id, toId: variant.new_plan_id }]
				: [],
		),
	]);

/**
 * Ids a rename may not take: every id in the projected catalog and every
 * persisted id, minus this plan's own rows. Persisted ids stay taken even
 * when this batch renames them away, so execute never depends on op order.
 * Reserved aliases are not taken — catalog execute claims them.
 */
const takenPlanIdsForRename = ({
	fromId,
	renameTargets,
	params,
	productStatesContext,
	updateCatalogPlan,
}: {
	fromId: string;
	renameTargets: RenameTarget[];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Set<string> => {
	const renamingInternalIds = new Set([
		...(productStatesContext.versionsByPlanId[fromId] ?? []).map(
			(product) => product.internal_id,
		),
		// new_version mints a new internal_id already stamped with toId
		...updateCatalogPlan.upsertProducts
			.filter((upsert) => upsert.row.planId === fromId)
			.map((upsert) => upsert.row.nextFullProduct.internal_id),
	]);
	const persistedProducts = Object.values(
		productStatesContext.versionsByPlanId,
	).flat();
	const siblingPlanIds = params.plans.flatMap((entry) => [
		...(entry.plan_id === fromId ? [] : [entry.plan_id]),
		...(entry.variants ?? [])
			.map((variant) => variant.variant_plan_id)
			.filter((id) => id !== fromId),
	]);
	const siblingRenameToIds = renameTargets
		.filter((target) => target.fromId !== fromId)
		.map((target) => target.toId);

	return new Set([
		...[...updateCatalogPlan.projected.products, ...persistedProducts]
			.filter((product) => !renamingInternalIds.has(product.internal_id))
			.map((product) => product.id),
		...siblingPlanIds,
		...siblingRenameToIds,
	]);
};

/**
 * Block new_plan_id when the target id is a live plan id, or when a
 * Vercel-installed customer is live on the plan (its id is their billing id).
 */
export const handleUpsertProductRenameErrors = async ({
	ctx,
	params,
	productStatesContext,
	updateCatalogPlan,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Promise<void> => {
	const renameTargets = renameTargetsFromParams({ params });
	for (const { fromId, toId } of renameTargets) {
		if (
			takenPlanIdsForRename({
				fromId,
				renameTargets,
				params,
				productStatesContext,
				updateCatalogPlan,
			}).has(toId)
		) {
			throw new RecaseError({
				message: `Cannot change product ID to ${toId}: a plan with that ID already exists (plan_id=${fromId})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (!ctx.org.processor_configs?.vercel) continue;

		const hasVercelCustomer = await hasVercelCustomerOnProduct({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			internalProductIds: (
				productStatesContext.versionsByPlanId[fromId] ?? []
			).map((product) => product.internal_id),
		});
		if (hasVercelCustomer) {
			throw new RecaseError({
				message: `Cannot change product ID while Vercel customers are subscribed to this plan (plan_id=${fromId})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
