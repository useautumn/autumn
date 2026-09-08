import {
	applyCustomizeToPlan,
	billingControlsFromColumns,
	type CatalogVariantParams,
	type FullProduct,
	type PlanLicenseParams,
	toCreatePlanItemParams,
} from "@autumn/shared";
import {
	applyLicenseParamsPatch,
	fullPlanLicenseToParams,
} from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/toPlanLicenseParams";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import type { ResolvedPlanParams } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const clonedLicenses = ({
	baseFullProduct,
	declaredLicenses,
	customize,
}: {
	baseFullProduct: FullProduct;
	declaredLicenses?: PlanLicenseParams[];
	customize?: CatalogVariantParams["customize"];
}): PlanLicenseParams[] =>
	applyLicenseParamsPatch({
		licenses:
			declaredLicenses ??
			(baseFullProduct.licenses ?? []).map((link) =>
				fullPlanLicenseToParams({ link }),
			),
		upsertLicenses: customize?.upsert_licenses,
		removeLicenses: customize?.remove_licenses,
	});

/** Clone the folded base into a v1 create, then apply variants[].customize. */
export const initVariantPlanParams = ({
	variant,
	baseFullProduct,
	declaredLicenses,
}: {
	variant: CatalogVariantParams;
	baseFullProduct: FullProduct;
	declaredLicenses?: PlanLicenseParams[];
}): ResolvedPlanParams => {
	const basePlan = fullProductToApiPlanV1Sync({ product: baseFullProduct });
	const applied = variant.customize
		? applyCustomizeToPlan({
				plan: basePlan,
				customize: variant.customize,
			})
		: {
				price: basePlan.price,
				items: basePlan.items,
				free_trial: basePlan.free_trial,
			};
	// The overlay's billing controls win over the base's columns.
	const billingControls =
		variant.customize?.billing_controls ??
		billingControlsFromColumns(baseFullProduct);
	const freeTrial = applied.free_trial
		? {
				...applied.free_trial,
				...(applied.free_trial.on_end == null
					? { on_end: undefined }
					: { on_end: applied.free_trial.on_end }),
			}
		: applied.free_trial;
	const licenses = clonedLicenses({
		baseFullProduct,
		declaredLicenses,
		customize: variant.customize,
	});

	return {
		plan_id: variant.variant_plan_id,
		version: 1,
		name: variant.name,
		description: baseFullProduct.description,
		group: baseFullProduct.group,
		add_on: baseFullProduct.is_add_on,
		is_default: false,
		...(applied.price != null ? { price: applied.price } : {}),
		items: applied.items.map((item) => toCreatePlanItemParams(item)),
		...(freeTrial !== undefined ? { free_trial: freeTrial } : {}),
		config: baseFullProduct.config,
		...(Object.keys(billingControls).length > 0
			? { billing_controls: billingControls }
			: {}),
		metadata: baseFullProduct.metadata,
		...(licenses.length > 0 ? { licenses } : {}),
		...(variant.processors !== undefined
			? { processors: variant.processors }
			: {}),
	};
};
