import type {
	ApiPlanV1,
	DiffedCustomizePlanV1,
	FullProduct,
	PlanUpdatePreviewOtherVersion,
	UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	applyDiffToVariantPlan,
	buildProductUpdatesFromApiPlan,
	fullProductToApiPlanV1,
	type VariantSettingsPatch,
	variantSettingsPatchHasValues,
} from "../common/planTransformUtils.js";
import { buildCorePlanUpdatePreview } from "../previewUpdatePlan/buildCorePlanUpdatePreview.js";
import { detectVariantConflicts } from "../previewUpdatePlan/detectVariantConflicts.js";
import { getPlanCustomerUsage } from "../previewUpdatePlan/hasPlanCustomers.js";

const getOtherVersions = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}) => {
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [product.id],
		returnAll: true,
	});

	return versions.filter(
		(version) => version.internal_id !== product.internal_id,
	);
};

export const previewOtherProductVersions = async ({
	ctx,
	product,
	currentPlan,
	editedPlan,
	diff,
	settingsPatch,
}: {
	ctx: AutumnContext;
	product: FullProduct;
	currentPlan: ApiPlanV1;
	editedPlan: ApiPlanV1;
	diff: DiffedCustomizePlanV1;
	settingsPatch?: VariantSettingsPatch;
}): Promise<PlanUpdatePreviewOtherVersion[]> => {
	const hasSettingsPatch =
		settingsPatch !== undefined && variantSettingsPatchHasValues(settingsPatch);
	if (Object.keys(diff).length === 0 && !hasSettingsPatch) return [];

	const otherVersions = await getOtherVersions({ ctx, product });

	return Promise.all(
		otherVersions.map(async (otherVersion) => {
			const otherPlan = await fullProductToApiPlanV1({
				ctx,
				product: otherVersion,
			});
			const previewPlan = applyDiffToVariantPlan({
				plan: otherPlan,
				diff,
				settingsPatch,
			});
			const { hasCustomers, customerCount } = await getPlanCustomerUsage({
				ctx,
				product: otherVersion,
			});

			return {
				...buildCorePlanUpdatePreview({
					ctx,
					planId: otherVersion.id,
					current: otherPlan,
					preview: previewPlan,
					hasCustomers,
					customerCount,
					versionable: false,
				}),
				version: otherVersion.version,
				conflicts: detectVariantConflicts({
					currentBasePlan: currentPlan,
					editedBasePlan: editedPlan,
					diff,
					variantPlan: otherPlan,
					features: ctx.features,
				}),
			};
		}),
	);
};

export const updateOtherProductVersions = async ({
	ctx,
	product,
	diff,
	settingsPatch,
	updateVersion,
}: {
	ctx: AutumnContext;
	product: FullProduct;
	diff: DiffedCustomizePlanV1;
	settingsPatch?: VariantSettingsPatch;
	updateVersion: (params: {
		product: FullProduct;
		updates: UpdateProductV2Params;
	}) => Promise<void>;
}) => {
	const hasSettingsPatch =
		settingsPatch !== undefined && variantSettingsPatchHasValues(settingsPatch);
	if (Object.keys(diff).length === 0 && !hasSettingsPatch) return;

	const otherVersions = await getOtherVersions({ ctx, product });

	for (const otherVersion of otherVersions) {
		const otherPlan = await fullProductToApiPlanV1({
			ctx,
			product: otherVersion,
		});
		const previewPlan = applyDiffToVariantPlan({
			plan: otherPlan,
			diff,
			settingsPatch,
		});
		const updates = buildProductUpdatesFromApiPlan({
			ctx,
			currentFullProduct: otherVersion,
			plan: previewPlan,
		});

		await updateVersion({ product: otherVersion, updates });
	}
};
