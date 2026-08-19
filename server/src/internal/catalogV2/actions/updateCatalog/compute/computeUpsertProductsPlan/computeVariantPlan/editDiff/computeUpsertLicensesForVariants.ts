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

/** Rebase one link: replay the base link's before→after change onto the
 * variant's link, then re-express the result off the variant's own stock. */
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

/** The variant's next license list under the base's declared licenses[].
 * Per declared entry: copy (link new to the variant) or rebase (link exists
 * on both sides). Links the base never declared stay untouched — never unlinks. */
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

/**
 * License lane of a variant's propagation edit: the base's declared licenses[]
 * rebased onto this variant's links, expressed as an upsert/remove patch.
 */
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

	// 1. Next links: per declared entry, copy or rebase onto the variant.
	const nextLicenses = nextVariantLicenses({
		variantLicenses,
		baseFromLicenses: productLicenses({ product: baseCurrent }),
		declaredLicenses,
	});

	// 2. Package current → next as an upsert/remove patch.
	return diffPlanLicenses({
		from: variantLicenses.map((link) =>
			toApiPlanLicenseSnapshot({ license: link }),
		),
		to: nextLicenses,
		includeAdds: true,
	});
};
