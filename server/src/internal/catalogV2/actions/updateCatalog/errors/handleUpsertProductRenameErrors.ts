import {
	ErrCode,
	RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { hasVercelCustomerOnProduct } from "@/internal/customers/cusProducts/repos/hasVercelCustomerOnProduct";

/**
 * Ids a rename may not take: every id in the projected catalog and every
 * persisted id, minus this plan's own rows. Persisted ids stay taken even
 * when this batch renames them away, so execute never depends on op order.
 */
const takenPlanIdsForRename = ({
	planParams,
	params,
	productStatesContext,
	updateCatalogPlan,
}: {
	planParams: UpdateCatalogParams["plans"][number];
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	updateCatalogPlan: UpdateCatalogPlan;
}): Set<string> => {
	const renamingInternalIds = new Set(
		(productStatesContext.versionsByPlanId[planParams.plan_id] ?? []).map(
			(product) => product.internal_id,
		),
	);
	const persistedProducts = Object.values(
		productStatesContext.versionsByPlanId,
	).flat();
	const siblingParamIds = params.plans.flatMap((entry) =>
		entry.plan_id === planParams.plan_id
			? []
			: [entry.plan_id, entry.new_plan_id].filter(
					(id): id is string => id != null,
				),
	);

	return new Set([
		...[...updateCatalogPlan.projected.products, ...persistedProducts]
			.filter((product) => !renamingInternalIds.has(product.internal_id))
			.map((product) => product.id),
		...siblingParamIds,
	]);
};

/**
 * Block new_plan_id when the target id is occupied, or when a Vercel-installed
 * customer is live on the plan (its id is their Vercel billing plan id).
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
	for (const planParams of params.plans) {
		if (!planParams.new_plan_id) continue;
		if (planParams.new_plan_id === planParams.plan_id) continue;

		if (
			takenPlanIdsForRename({
				planParams,
				params,
				productStatesContext,
				updateCatalogPlan,
			}).has(planParams.new_plan_id)
		) {
			throw new RecaseError({
				message: `Cannot change product ID to ${planParams.new_plan_id}: a plan with that ID already exists (plan_id=${planParams.plan_id})`,
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
				productStatesContext.versionsByPlanId[planParams.plan_id] ?? []
			).map((product) => product.internal_id),
		});
		if (hasVercelCustomer) {
			throw new RecaseError({
				message: `Cannot change product ID while Vercel customers are subscribed to this plan (plan_id=${planParams.plan_id})`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}
};
