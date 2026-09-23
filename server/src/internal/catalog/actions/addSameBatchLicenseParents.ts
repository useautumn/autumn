import type {
	CatalogPlanParams,
	CatalogUpdateParams,
	UpdateLicenseParentParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

type ParentLinkInBatch = {
	licensePlanId: string;
	parent: UpdateLicenseParentParams;
};

const parentKey = ({ plan_id, version }: UpdateLicenseParentParams) =>
	`${plan_id}@${version}`;

const resolveParentVersion = async ({
	ctx,
	parentPlan,
}: {
	ctx: AutumnContext;
	parentPlan: CatalogPlanParams;
}) => {
	if (parentPlan.version !== undefined) return parentPlan.version;
	const current = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: parentPlan.plan_id,
		orgId: ctx.org.id,
		env: ctx.env,
		allowNotFound: true,
	});
	return current?.version;
};

const listStockParentLinksInBatch = async ({
	ctx,
	plans,
}: {
	ctx: AutumnContext;
	plans: CatalogPlanParams[];
}): Promise<ParentLinkInBatch[]> => {
	const batchPlanIds = new Set(plans.map((plan) => plan.plan_id));
	const links = await Promise.all(
		plans.map(async (parentPlan) => {
			const stockLinks = (parentPlan.licenses ?? []).filter(
				(license) =>
					license.customize == null &&
					batchPlanIds.has(license.license_plan_id),
			);
			if (stockLinks.length === 0) return [];
			const version = await resolveParentVersion({ ctx, parentPlan });
			if (version === undefined) return [];
			return stockLinks.map((license) => ({
				licensePlanId: license.license_plan_id,
				parent: { plan_id: parentPlan.plan_id, version },
			}));
		}),
	);
	return links.flat();
};

/** A parent sent in the same batch with a stock link already declares the new
 * license shape, so it follows the edit instead of being frozen at the old one. */
export const addSameBatchLicenseParents = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateParams;
}): Promise<CatalogUpdateParams> => {
	const plans = params.plans ?? [];
	const parentLinks = await listStockParentLinksInBatch({ ctx, plans });
	if (parentLinks.length === 0) return params;

	return {
		...params,
		plans: plans.map((plan) => {
			const sameBatchParents = parentLinks
				.filter((link) => link.licensePlanId === plan.plan_id)
				.map((link) => link.parent);
			if (sameBatchParents.length === 0) return plan;
			const explicitParents = plan.update_license_parents ?? [];
			const explicitKeys = new Set(explicitParents.map(parentKey));
			return {
				...plan,
				update_license_parents: [
					...explicitParents,
					...sameBatchParents.filter(
						(parent) => !explicitKeys.has(parentKey(parent)),
					),
				],
			};
		}),
	};
};
