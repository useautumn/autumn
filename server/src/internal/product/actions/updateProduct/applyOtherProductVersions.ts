import type { FullProduct, UpdateProductV2Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	fullProductToApiPlanV1,
	getApiPlanDiff,
	getVariantSettingsPatch,
	variantSettingsPatchHasValues,
} from "../common/planTransformUtils.js";
import { updateOtherProductVersions } from "./updateOtherProductVersions.js";

export const applyOtherProductVersions = async ({
	ctx,
	enabled,
	productBeforeUpdate,
	latestProduct,
	updateVersion,
}: {
	ctx: AutumnContext;
	enabled?: boolean;
	productBeforeUpdate: FullProduct;
	latestProduct: FullProduct;
	updateVersion: (params: {
		product: FullProduct;
		updates: UpdateProductV2Params;
	}) => Promise<void>;
}) => {
	if (!enabled) return;

	const [currentPlan, updatedPlan] = await Promise.all([
		fullProductToApiPlanV1({ ctx, product: productBeforeUpdate }),
		fullProductToApiPlanV1({ ctx, product: latestProduct }),
	]);
	const diff = getApiPlanDiff({ from: currentPlan, to: updatedPlan });
	const settingsPatch = getVariantSettingsPatch({
		from: currentPlan,
		to: updatedPlan,
	});

	await updateOtherProductVersions({
		ctx,
		product: productBeforeUpdate,
		diff,
		settingsPatch: variantSettingsPatchHasValues(settingsPatch)
			? settingsPatch
			: undefined,
		updateVersion,
	});
};
