import type { DiffedCustomizePlanV1, FullProduct } from "@autumn/shared";
import type { ApiPlanV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyDiffToVariantPlan,
	buildProductUpdatesFromApiPlan,
	fullProductToApiPlanV1,
	getApiPlanDiff,
	getVariantSettingsPatch,
	variantSettingsPatchHasValues,
	type VariantSettingsPatch,
} from "../common/planTransformUtils.js";
import { updateProduct } from "../updateProduct.js";
import { updateOtherProductVersions } from "../updateProduct/updateOtherProductVersions.js";

export const updateVariant = async ({
	ctx,
	variant,
	diff,
	settingsPatch,
	targetPlan,
	shouldVersion,
	baseInternalProductId,
	allVersions,
}: {
	ctx: AutumnContext;
	variant: FullProduct;
	diff?: DiffedCustomizePlanV1;
	settingsPatch?: VariantSettingsPatch;
	targetPlan?: ApiPlanV1;
	shouldVersion: boolean;
	baseInternalProductId?: string;
	allVersions?: boolean;
}) => {
	const currentPlan = await fullProductToApiPlanV1({
		ctx,
		product: variant,
	});
	const previewPlan =
		targetPlan ??
		applyDiffToVariantPlan({
			plan: currentPlan,
			diff: diff ?? {},
			settingsPatch,
		});
	const updates = buildProductUpdatesFromApiPlan({
		ctx,
		currentFullProduct: variant,
		plan: previewPlan,
	});

	await updateProduct({
		ctx,
		productId: variant.id,
		query: shouldVersion ? { force_version: true } : { disable_version: true },
		updates,
		initialFullProduct: variant,
		baseInternalProductId,
		allowVariantSettingsUpdate: true,
	});

	if (!allVersions) return;

	const diffForOtherVersions = getApiPlanDiff({
		from: currentPlan,
		to: previewPlan,
	});
	const settingsForOtherVersions = getVariantSettingsPatch({
		from: currentPlan,
		to: previewPlan,
	});
	await updateOtherProductVersions({
		ctx,
		product: variant,
		diff: diffForOtherVersions,
		settingsPatch: variantSettingsPatchHasValues(settingsForOtherVersions)
			? settingsForOtherVersions
			: undefined,
		updateVersion: async ({ product, updates }) => {
			await updateProduct({
				ctx,
				productId: product.id,
				query: { version: product.version, disable_version: true },
				updates,
				initialFullProduct: product,
				allowVariantSettingsUpdate: true,
				skipVariantUpdates: true,
			});
		},
	});
};
