import {
	type ApiPlanLicenseV1,
	applyCustomizeToPlan,
	applyDiff,
	applyLicenseCustomizeToBasePlan,
	type CatalogVariantParams,
	type CustomizePlanLicense,
	type DiffablePlanV1,
	type DiffedCustomizePlanV1,
	diffLicensePlanCustomize,
	diffPlanV1,
	type FullProduct,
	type PlanLicenseParams,
} from "@autumn/shared";
import { diffFullProducts } from "@/internal/catalogV2/actions/buildPlanChange/diffFullProducts";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import { computeUpsertLicensesForVariants } from "./computeUpsertLicensesForVariants";

const applyOnto = ({
	plan,
	diff,
}: {
	plan: DiffablePlanV1;
	diff: DiffedCustomizePlanV1;
}): DiffablePlanV1 => {
	const applied = applyDiff({ base: plan, diff });
	return {
		...plan,
		price: applied.price,
		items: applied.items,
		free_trial: applied.free_trial,
		...(applied.licenses !== undefined ? { licenses: applied.licenses } : {}),
	};
};

const isEmptyDiff = (diff: DiffedCustomizePlanV1) =>
	diff.price === undefined &&
	diff.add_items === undefined &&
	diff.remove_items === undefined &&
	diff.free_trial === undefined &&
	diff.upsert_licenses === undefined &&
	diff.remove_licenses === undefined;

/** Apply variants[n].customize.upsert_licenses as a slot-level patch onto
 * the current license list (follow's rebase first), not a wholesale replace. */
const mergeUpsertLicensesOntoPlan = ({
	plan,
	variantProduct,
	upsertLicenses,
}: {
	plan: DiffablePlanV1;
	variantProduct: FullProduct;
	upsertLicenses: CustomizePlanLicense[];
}): DiffablePlanV1 => {
	const licenses = [...(plan.licenses ?? [])];
	for (const upsert of upsertLicenses) {
		const index = licenses.findIndex(
			(license) => license.license_plan_id === upsert.license_plan_id,
		);
		const existing = index >= 0 ? licenses[index] : undefined;
		const variantLink = variantProduct.licenses?.find(
			(link) => link.product.id === upsert.license_plan_id,
		);
		const stock = variantLink
			? fullProductToApiPlanV1Sync({
					product: variantLink.base_product ?? variantLink.product,
				})
			: undefined;

		let nextCustomize = upsert.customize ?? undefined;
		if (upsert.customize === null) {
			nextCustomize = undefined;
		} else if (upsert.customize && existing?.customize && stock) {
			const nextEffective = applyLicenseCustomizeToBasePlan({
				basePlan: applyLicenseCustomizeToBasePlan({
					basePlan: stock,
					customize: existing.customize,
				}),
				customize: upsert.customize,
			});
			nextCustomize = diffLicensePlanCustomize({
				basePlan: stock,
				effectivePlan: nextEffective,
			});
		}

		const nextLicense: ApiPlanLicenseV1 = {
			license_plan_id: upsert.license_plan_id,
			version: existing?.version ?? 1,
			included: upsert.included ?? existing?.included ?? 0,
			prepaid_only: upsert.prepaid_only ?? existing?.prepaid_only ?? true,
			...(nextCustomize !== undefined ? { customize: nextCustomize } : {}),
		};
		if (index >= 0) licenses[index] = nextLicense;
		else licenses.push(nextLicense);
	}
	return { ...plan, licenses };
};

/** The base's current→next edit, rebased for this variant. Licenses can't ride
 * the base diff: baseNext.licenses isn't computed yet, and follow must rebase. */
const buildPropagationEdit = ({
	variantProduct,
	baseCurrent,
	baseNext,
	declaredLicenses,
}: {
	variantProduct: FullProduct;
	baseCurrent: FullProduct;
	baseNext: FullProduct;
	declaredLicenses?: PlanLicenseParams[];
}): DiffedCustomizePlanV1 => {
	const {
		upsert_licenses: _upsert,
		remove_licenses: _remove,
		...contentEdit
	} = diffFullProducts({ from: baseCurrent, to: baseNext });
	if (declaredLicenses === undefined) return contentEdit;

	return {
		...contentEdit,
		...computeUpsertLicensesForVariants({
			variantProduct,
			baseCurrent,
			declaredLicenses,
		}),
	};
};

const hasContentCustomize = (
	customize: NonNullable<CatalogVariantParams["customize"]>,
): boolean =>
	customize.price !== undefined ||
	customize.items !== undefined ||
	customize.add_items !== undefined ||
	customize.remove_items !== undefined ||
	customize.free_trial !== undefined;

/**
 * Follow applies the base current→next diff onto the variant; customize then
 * patches on top. Declared customize alone recomposes over the declaring
 * base row's pre-edit content.
 */
export const buildVariantEditDiff = ({
	variantProduct,
	baseCurrent,
	baseNext,
	follow,
	customize,
	declaredLicenses,
}: {
	variantProduct: FullProduct;
	baseCurrent: FullProduct | null;
	baseNext: FullProduct;
	follow: boolean;
	customize?: CatalogVariantParams["customize"];
	declaredLicenses?: PlanLicenseParams[];
}): DiffedCustomizePlanV1 | undefined => {
	const currentPlan = fullProductToApiPlanV1Sync({ product: variantProduct });

	let nextPlan: DiffablePlanV1 = currentPlan;
	if (follow && baseCurrent) {
		nextPlan = applyOnto({
			plan: nextPlan,
			diff: buildPropagationEdit({
				variantProduct,
				baseCurrent,
				baseNext,
				declaredLicenses,
			}),
		});
	}
	if (customize) {
		const { upsert_licenses, ...contentCustomize } = customize;
		if (!follow) {
			const basePlan = fullProductToApiPlanV1Sync({
				product: baseCurrent ?? baseNext,
			});
			nextPlan = hasContentCustomize(customize)
				? {
						...applyCustomizeToPlan({
							plan: basePlan,
							customize: contentCustomize,
						}),
						licenses: currentPlan.licenses,
					}
				: { ...basePlan, licenses: currentPlan.licenses };
		} else if (hasContentCustomize(customize)) {
			nextPlan = {
				...applyCustomizeToPlan({ plan: nextPlan, customize: contentCustomize }),
				licenses: nextPlan.licenses,
			};
		}
		if (upsert_licenses !== undefined) {
			nextPlan = mergeUpsertLicensesOntoPlan({
				plan: nextPlan,
				variantProduct,
				upsertLicenses: upsert_licenses,
			});
		}
	}

	const editDiff = diffPlanV1({
		from: currentPlan,
		to: nextPlan,
		includeAdds: true,
	});
	if (isEmptyDiff(editDiff)) return undefined;
	return editDiff;
};
