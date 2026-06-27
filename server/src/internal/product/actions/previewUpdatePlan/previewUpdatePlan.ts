import {
	diffPlanV1,
	type PlanUpdatePreview,
	PlanUpdatePreviewSchema,
	type PreviewUpdatePlanParamsV2,
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

	const previewCtx = {
		expand: data.expand ?? [],
	};

	const incomingProductV2 = buildIncomingProductV2({
		ctx,
		base: baseFullProduct,
		data,
	});
	const incomingFullProduct = buildIncomingFullProduct({
		ctx,
		base: baseFullProduct,
		product: incomingProductV2,
	});

	const [hasCustomers, currentPlan, previewPlan] = await Promise.all([
		hasPlanCustomers({ ctx, product: baseFullProduct }),
		getPlanResponse({ ctx, product: baseFullProduct, features: ctx.features }),
		getPlanResponse({
			ctx,
			product: incomingFullProduct,
			features: ctx.features,
		}),
	]);

	const versionable = planWouldVersion({
		ctx,
		current: baseFullProduct,
		incoming: incomingProductV2,
		updates: data,
		hasCustomers,
	});

	const diff = diffPlanV1({ from: currentPlan, to: previewPlan });
	const variants = await previewAffectedVariants({
		ctx,
		base: baseFullProduct,
		diff,
		data,
		previewCtx,
	});

	return PlanUpdatePreviewSchema.parse({
		...buildCorePlanUpdatePreview({
			ctx: previewCtx,
			planId: data.plan_id,
			current: currentPlan,
			preview: previewPlan,
			hasCustomers,
			versionable,
		}),
		variants,
	});
};
