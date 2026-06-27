import type { DiffedCustomizePlanV1, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyDiffToVariantPlan,
	buildProductUpdatesFromApiPlan,
	fullProductToApiPlanV1,
} from "../common/planTransformUtils.js";
import { updateProduct } from "../updateProduct.js";

export const updateVariant = async ({
	ctx,
	variant,
	diff,
	shouldVersion,
	baseInternalProductId,
}: {
	ctx: AutumnContext;
	variant: FullProduct;
	diff: DiffedCustomizePlanV1;
	shouldVersion: boolean;
	baseInternalProductId?: string;
}) => {
	const currentPlan = await fullProductToApiPlanV1({
		ctx,
		product: variant,
	});
	const previewPlan = applyDiffToVariantPlan({
		plan: currentPlan,
		diff,
	});
	const updates = buildProductUpdatesFromApiPlan({
		ctx,
		currentFullProduct: variant,
		plan: previewPlan,
	});

	await updateProduct({
		ctx,
		productId: variant.id,
		query: shouldVersion
			? { force_version: true }
			: { disable_version: true },
		updates,
		initialFullProduct: variant,
		baseInternalProductId,
	});
};
