import type {
	CatalogPlanParams,
	FullProduct,
	PlanUpdatePreview,
	PreviewUpdatePlanParamsV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	previewPlanLicenseSync,
	validatePlanLicenseUpdate,
} from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { buildIncomingFullProduct } from "@/internal/product/actions/previewUpdatePlan/buildIncomingFullProduct.js";
import { buildIncomingProductV2 } from "@/internal/product/actions/previewUpdatePlan/buildIncomingProductV2.js";
import { previewAffectedLicenses } from "@/internal/product/actions/previewUpdatePlan/previewAffectedLicenses.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	sortCatalogPlansByDependencies,
	validateCatalogPlanVersionTargets,
} from "./catalogPlanDependencies.js";

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
	validateCatalogPlanVersionTargets({ plans, products: persistedProducts });
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
		const incoming = current
			? buildIncomingFullProduct({
					ctx,
					base: current,
					product: buildIncomingProductV2({
						ctx,
						base: current,
						data: {
							...plan,
							licenses: undefined,
						} as PreviewUpdatePlanParamsV2,
					}),
				})
			: undefined;
		return virtualProduct({
			current: incoming,
			id: plan.new_plan_id ?? plan.plan_id,
			version: current
				? previews[index]?.versionable
					? (latest?.version ?? current.version) + 1
					: current.version
				: (plan.version ?? 1),
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
		preview.license_changes = await previewAffectedLicenses({
			ctx,
			currentParentProduct: {
				...parent,
				licenses: current?.licenses ?? [],
			},
			resolved: licensePreview.prepared?.resolved ?? [],
			structuralChanges: licensePreview.changes,
		});
		if (preview.plan) preview.plan.licenses = licensePreview.licenses;
	}

	for (const childPreview of previews) {
		for (const parentPreview of childPreview.license_parents) {
			const parentIndex = plans.findIndex(
				(plan) =>
					plan.plan_id === parentPreview.plan_id &&
					(plan.version ?? parentPreview.version) === parentPreview.version,
			);
			if (parentIndex < 0) continue;
			const directChange = previews[parentIndex]?.license_changes.find(
				(change) => change.license_plan_id === childPreview.plan_id,
			);
			if (!directChange) continue;
			parentPreview.license_changes = [directChange];
			parentPreview.update_source = "direct";
			parentPreview.conflicts = [];
		}
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
