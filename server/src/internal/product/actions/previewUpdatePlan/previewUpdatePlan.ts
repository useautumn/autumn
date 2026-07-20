import {
	diffPlanV1,
	type FullProduct,
	type PlanUpdatePreview,
	PlanUpdatePreviewSchema,
	type PreviewUpdatePlanParamsV2,
	type ProductV2,
	type UpdateVariantParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	previewPlanLicenseSync,
	validatePlanLicenseUpdate,
} from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { getVariantSettingsPatch } from "../common/planTransformUtils.js";
import { previewOtherProductVersions } from "../updateProduct/updateOtherProductVersions.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";
import { buildIncomingFullProduct } from "./buildIncomingFullProduct.js";
import { buildIncomingProductV2 } from "./buildIncomingProductV2.js";
import { getPreviewTargetProduct } from "./getPreviewTargetProduct.js";
import { getPlanCustomerUsage } from "./hasPlanCustomers.js";
import { planWouldVersion } from "./planWouldVersion.js";
import { previewAffectedLicenses } from "./previewAffectedLicenses.js";
import { previewAffectedVariants } from "./previewAffectedVariants.js";

export const buildPlanUpdatePreview = async ({
	ctx,
	currentFullProduct,
	incomingProductV2,
	data,
	variantUpdates,
	hasCustomers,
	customerCount,
	currency = "usd",
}: {
	ctx: AutumnContext;
	currentFullProduct: FullProduct;
	incomingProductV2: ProductV2;
	data: PreviewUpdatePlanParamsV2;
	variantUpdates?: UpdateVariantParams[];
	hasCustomers: boolean;
	customerCount: number;
	currency?: string;
}): Promise<PlanUpdatePreview> => {
	const incomingFullProduct = buildIncomingFullProduct({
		ctx,
		base: currentFullProduct,
		product: incomingProductV2,
	});

	const [currentPlan, previewPlan] = await Promise.all([
		getPlanResponse({
			ctx,
			product: currentFullProduct,
			features: ctx.features,
			currency,
		}),
		getPlanResponse({
			ctx,
			product: incomingFullProduct,
			features: ctx.features,
			currency,
		}),
	]);

	const versionable = planWouldVersion({
		ctx,
		current: currentFullProduct,
		incoming: incomingProductV2,
		updates: data,
		hasCustomers,
	});
	const licensePreview = await previewPlanLicenseSync({
		ctx,
		parentProduct: incomingFullProduct,
		licenses: data.licenses,
		newParentVersion: versionable,
	});
	previewPlan.licenses = licensePreview.licenses;
	const diff = diffPlanV1({
		from: currentPlan,
		to: previewPlan,
		includeCurrencyListChanges: true,
	});
	const settingsPatch = getVariantSettingsPatch({
		from: currentPlan,
		to: previewPlan,
	});
	const shouldPreviewVersions = Boolean(
		data.include_versions || data.all_versions,
	);
	const shouldPreviewVariants = Boolean(
		data.include_variants ||
			(data.update_variant_ids?.length ?? 0) > 0 ||
			(data.variants?.length ?? 0) > 0,
	);
	const [licenseChanges, variants, otherVersions] = await Promise.all([
		previewAffectedLicenses({
			ctx,
			currentParentProduct: currentFullProduct,
			resolved: licensePreview.prepared?.resolved ?? [],
			structuralChanges: licensePreview.changes,
		}),
		shouldPreviewVariants
			? previewAffectedVariants({
					ctx,
					base: currentFullProduct,
					diff,
					currentBasePlan: currentPlan,
					settingsPatch,
					editedBasePlan: previewPlan,
					data,
					variantUpdates,
				})
			: [],
		shouldPreviewVersions
			? previewOtherProductVersions({
					ctx,
					product: currentFullProduct,
					currentPlan,
					editedPlan: previewPlan,
					diff,
					settingsPatch,
				})
			: [],
	]);

	return PlanUpdatePreviewSchema.parse({
		...buildCorePlanUpdatePreview({
			ctx,
			planId: data.plan_id,
			current: currentPlan,
			preview: previewPlan,
			hasCustomers,
			customerCount,
			versionable,
		}),
		license_changes: licenseChanges,
		variants,
		other_versions: otherVersions,
	});
};

export const previewUpdatePlan = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: PreviewUpdatePlanParamsV2;
}): Promise<PlanUpdatePreview> => {
	validatePlanLicenseUpdate({
		allVersions: data.all_versions,
		licenses: data.licenses,
	});
	const baseFullProduct = await getPreviewTargetProduct({
		ctx,
		planId: data.plan_id,
		version: data.version,
	});

	const previewCtx: AutumnContext = {
		...ctx,
		expand: data.expand ?? [],
	};

	const incomingProductV2 = buildIncomingProductV2({
		ctx: previewCtx,
		base: baseFullProduct,
		data,
	});

	const baseUsage = await getPlanCustomerUsage({
		ctx: previewCtx,
		product: baseFullProduct,
	});

	return buildPlanUpdatePreview({
		ctx: previewCtx,
		currentFullProduct: baseFullProduct,
		incomingProductV2,
		data,
		variantUpdates: data.variants,
		hasCustomers: baseUsage.hasCustomers,
		customerCount: baseUsage.customerCount,
	});
};
