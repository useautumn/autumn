import type {
	ApiPlanLicenseV1,
	ApiPlanV1,
	DiffedCustomizePlanV1,
	FullPlanLicense,
	FullProductWithoutLicenses,
	PlanLicenseParams,
} from "@autumn/shared";
import {
	applyLicenseCustomizeToBasePlan,
	diffLicensePlanCustomize,
	diffPlanLicenses,
	replayPlanDiff,
} from "@autumn/shared";
import { toApiPlanLicenseSnapshot } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/toApiPlanLicenseSnapshot";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";

type ProductWithLicenses = FullProductWithoutLicenses & {
	licenses?: FullPlanLicense[];
};

const productLicenses = ({
	product,
}: {
	product: ProductWithLicenses;
}): FullPlanLicense[] => product.licenses ?? [];

const stockPlan = ({ link }: { link: FullPlanLicense }): ApiPlanV1 =>
	fullProductToApiPlanV1Sync({
		product: link.base_product ?? link.product,
	});

const effectivePlan = ({ link }: { link: FullPlanLicense }): ApiPlanV1 =>
	fullProductToApiPlanV1Sync({
		product: link.product,
	});

const declaredToSnapshot = ({
	declared,
	version,
}: {
	declared: PlanLicenseParams;
	version: number;
}): ApiPlanLicenseV1 => ({
	license_plan_id: declared.license_plan_id,
	version,
	included: declared.included ?? 0,
	prepaid_only: declared.prepaid_only ?? true,
	...(declared.customize != null ? { customize: declared.customize } : {}),
});

const rebaseExistingLicense = ({
	variantLink,
	baseFromLink,
	declared,
}: {
	variantLink: FullPlanLicense;
	baseFromLink: FullPlanLicense;
	declared: PlanLicenseParams;
}): ApiPlanLicenseV1 => {
	const variantNext = replayPlanDiff({
		from: effectivePlan({ link: baseFromLink }),
		to: applyLicenseCustomizeToBasePlan({
			basePlan: stockPlan({ link: baseFromLink }),
			customize: declared.customize ?? {},
		}),
		onto: effectivePlan({ link: variantLink }),
	});
	const nextCustomize = diffLicensePlanCustomize({
		basePlan: stockPlan({ link: variantLink }),
		effectivePlan: variantNext,
	});

	return {
		...toApiPlanLicenseSnapshot({ license: variantLink }),
		included: declared.included ?? variantLink.included,
		prepaid_only: declared.prepaid_only ?? variantLink.prepaid_only,
		...(nextCustomize !== undefined ? { customize: nextCustomize } : {}),
	};
};

const nextVariantLicenses = ({
	variantLicenses,
	baseFromLicenses,
	declaredLicenses,
}: {
	variantLicenses: FullPlanLicense[];
	baseFromLicenses: FullPlanLicense[];
	declaredLicenses: PlanLicenseParams[];
}): ApiPlanLicenseV1[] => {
	const variantById = new Map(
		variantLicenses.map((link) => [link.product.id, link]),
	);
	const baseFromById = new Map(
		baseFromLicenses.map((link) => [link.product.id, link]),
	);
	const nextById = new Map(
		variantLicenses.map((link) => [
			link.product.id,
			toApiPlanLicenseSnapshot({ license: link }),
		]),
	);

	for (const declared of declaredLicenses) {
		const variantLink = variantById.get(declared.license_plan_id);
		const baseFromLink = baseFromById.get(declared.license_plan_id);

		if (!variantLink) {
			nextById.set(
				declared.license_plan_id,
				declaredToSnapshot({
					declared,
					version: baseFromLink?.product.version ?? 1,
				}),
			);
			continue;
		}
		if (!baseFromLink) {
			nextById.set(
				declared.license_plan_id,
				declaredToSnapshot({
					declared,
					version: variantLink.product.version,
				}),
			);
			continue;
		}

		nextById.set(
			declared.license_plan_id,
			rebaseExistingLicense({ variantLink, baseFromLink, declared }),
		);
	}

	return [...nextById.values()];
};

export const computeUpsertLicensesForVariants = ({
	variantProduct,
	baseCurrent,
	declaredLicenses,
}: {
	variantProduct: ProductWithLicenses;
	baseCurrent: ProductWithLicenses;
	declaredLicenses: PlanLicenseParams[];
}): Pick<DiffedCustomizePlanV1, "upsert_licenses" | "remove_licenses"> => {
	const variantLicenses = productLicenses({ product: variantProduct });

	const nextLicenses = nextVariantLicenses({
		variantLicenses,
		baseFromLicenses: productLicenses({ product: baseCurrent }),
		declaredLicenses,
	});

	return diffPlanLicenses({
		from: variantLicenses.map((link) =>
			toApiPlanLicenseSnapshot({ license: link }),
		),
		to: nextLicenses,
		includeAdds: true,
	});
};
