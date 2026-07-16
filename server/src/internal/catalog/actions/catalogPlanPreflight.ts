import type {
	CatalogPlanParams,
	FullProduct,
	PlanUpdatePreview,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	previewPlanLicenseSync,
	validatePlanLicenseUpdate,
} from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { sortCatalogPlansByDependencies } from "./catalogPlanDependencies.js";

const virtualProduct = ({
	current,
	id,
	version,
	archived,
}: {
	current?: FullProduct;
	id: string;
	version: number;
	archived?: boolean;
}): FullProduct =>
	({
		...(current ?? {}),
		id,
		version,
		archived: archived ?? current?.archived ?? false,
		internal_id:
			current?.version === version
				? current.internal_id
				: `virtual:${id}:${version}`,
		licenses: current?.licenses ?? [],
	}) as FullProduct;

const preflightCatalogLicenses = async ({
	ctx,
	plans,
	previews,
}: {
	ctx: AutumnContext;
	plans: CatalogPlanParams[];
	previews: PlanUpdatePreview[];
}) => {
	const persistedProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
	const currentById = new Map<string, FullProduct>();
	for (const product of persistedProducts) {
		const current = currentById.get(product.id);
		if (!current || product.version > current.version) {
			currentById.set(product.id, product);
		}
	}
	const currentForPlan = (plan: CatalogPlanParams) =>
		plan.version === undefined
			? currentById.get(plan.plan_id)
			: persistedProducts.find(
					(product) =>
						product.id === plan.plan_id && product.version === plan.version,
				);
	const virtualParents = plans.map((plan, index) => {
		const current = currentForPlan(plan);
		const latest = currentById.get(plan.plan_id);
		return virtualProduct({
			current,
			id: plan.new_plan_id ?? plan.plan_id,
			version: current
				? previews[index]?.versionable
					? (latest?.version ?? current.version) + 1
					: current.version
				: 1,
			archived: plan.archived,
		});
	});
	const licenseProducts = [...virtualParents, ...persistedProducts];
	for (const [index, plan] of plans.entries()) {
		const preview = previews[index]!;
		const current = currentForPlan(plan);
		const parent = virtualParents[index]!;
		const licensePreview = await previewPlanLicenseSync({
			ctx,
			parentProduct: { ...parent, licenses: current?.licenses ?? [] },
			licenses: plan.licenses,
			fromInternalProductId: current?.internal_id ?? parent.internal_id,
			newParentVersion: preview.versionable || !current,
			licenseProducts,
		});
		preview.license_changes = licensePreview.changes;
		if (preview.plan) preview.plan.licenses = licensePreview.licenses;
	}
};

export const preflightCatalogPlans = async ({
	ctx,
	plans,
	previews,
}: {
	ctx: AutumnContext;
	plans: CatalogPlanParams[];
	previews: PlanUpdatePreview[];
}) => {
	for (const plan of plans) {
		validatePlanLicenseUpdate({
			allVersions: plan.all_versions,
			licenses: plan.licenses,
		});
	}
	// Validate cycles without disturbing plan/previews index alignment.
	sortCatalogPlansByDependencies(plans);
	await preflightCatalogLicenses({ ctx, plans, previews });
};
