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
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { buildCorePlanUpdatePreview } from "./buildCorePlanUpdatePreview.js";
import { buildIncomingFullProduct } from "./buildIncomingFullProduct.js";
import { buildIncomingProductV2 } from "./buildIncomingProductV2.js";
import { getBaseFullProduct } from "./getBaseFullProduct.js";
import { hasPlanCustomers } from "./hasPlanCustomers.js";
import { planWouldVersion } from "./planWouldVersion.js";
import { previewAffectedVariants } from "./previewAffectedVariants.js";
import { getVariantSettingsPatch } from "../common/planTransformUtils.js";

export const buildPlanUpdatePreview = async ({
	ctx,
	currentFullProduct,
	incomingProductV2,
	data,
	variantUpdates,
	hasCustomers,
	currency = "usd",
}: {
	ctx: AutumnContext;
	currentFullProduct: FullProduct;
	incomingProductV2: ProductV2;
	data: PreviewUpdatePlanParamsV2;
	variantUpdates?: UpdateVariantParams[];
	hasCustomers: boolean;
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
	const diff = diffPlanV1({ from: currentPlan, to: previewPlan });
	const settingsPatch = getVariantSettingsPatch({
		from: currentPlan,
		to: previewPlan,
	});
	const variants = await previewAffectedVariants({
		ctx,
		base: currentFullProduct,
		diff,
		settingsPatch,
		editedBasePlan: previewPlan,
		data,
		variantUpdates,
	});

	return PlanUpdatePreviewSchema.parse({
		...buildCorePlanUpdatePreview({
			ctx,
			planId: data.plan_id,
			current: currentPlan,
			preview: previewPlan,
			hasCustomers,
			versionable,
		}),
		variants,
	});
};

export const previewUpdatePlan = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: PreviewUpdatePlanParamsV2;
}): Promise<PlanUpdatePreview> => {
	const baseFullProduct = await getBaseFullProduct({
		ctx,
		planId: data.plan_id,
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

	return buildPlanUpdatePreview({
		ctx: previewCtx,
		currentFullProduct: baseFullProduct,
		incomingProductV2,
		data,
		variantUpdates: data.variants,
		hasCustomers: await hasPlanCustomers({
			ctx: previewCtx,
			product: baseFullProduct,
		}),
	});
};
