import type {
	DiffedCustomizePlanV1,
	FullProduct,
	UpdateVariantParams,
} from "@autumn/shared";
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
import {
	validateDirectVariantControls,
	variantCustomizeChanged,
} from "../common/variantUpdateSource.js";
import { updateProduct } from "../updateProduct.js";
import { createPlanMigrationDraft } from "../updateProduct/createPlanMigrationDraft.js";
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
	variantUpdate,
}: {
	ctx: AutumnContext;
	variant: FullProduct;
	diff?: DiffedCustomizePlanV1;
	settingsPatch?: VariantSettingsPatch;
	targetPlan?: ApiPlanV1;
	shouldVersion: boolean;
	baseInternalProductId?: string;
	allVersions?: boolean;
	variantUpdate?: UpdateVariantParams;
}) => {
	const currentPlan = await fullProductToApiPlanV1({
		ctx,
		product: variant,
	});
	const isDirectUpdate = variantUpdate
		? variantCustomizeChanged({
				currentCustomize: currentPlan.variant_details?.customize,
				incomingCustomize: variantUpdate.customize,
			})
		: false;
	validateDirectVariantControls({
		isDirect: isDirectUpdate,
		variantPlanId: variant.id,
		hasControls: Boolean(
			variantUpdate?.force_version ||
				variantUpdate?.disable_version ||
				variantUpdate?.create_migration,
		),
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

	if (variantUpdate?.create_migration && isDirectUpdate && !shouldVersion) {
		await createPlanMigrationDraft({
			ctx,
			current: variant,
			fromPlan: currentPlan,
			mode: "version",
			planId: variant.id,
			selectedVariantIds: [],
			toPlan: previewPlan,
		});
	}

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
