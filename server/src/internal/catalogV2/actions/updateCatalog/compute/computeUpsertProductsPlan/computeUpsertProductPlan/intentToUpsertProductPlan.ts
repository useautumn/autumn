import {
	productToProductKey,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assembleNextFullProduct } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/assembleNextFullProduct";
import { declaredVariantsForSource } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/declaredVariantsForSource";
import { computeCatalogEntitlementPricesPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeCatalogEntitlementPricesPlan/computeCatalogEntitlementPricesPlan";
import { computeFreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeFreeTrialPlan/computeFreeTrialPlan";
import { computeProductDetailsPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeProductDetailsPlan/computeProductDetailsPlan";
import { resolveUpsertVariantPointer } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/resolveUpsertVariantPointer";
import { resolveUpsertOp } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertOp";
import { resolveUpsertVersioning } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/resolveUpsertVersioning";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { planParamsFromEditDiff } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/planParamsFromEditDiff";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";
import { resolveAliasReplacement } from "@/internal/catalogV2/productAliases/resolveAliasReplacement";
import { shouldProtectReferencedCatalogRows } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const planHasVersionableCustomers = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): boolean =>
	(productStatesContext.versionsByPlanId[planId] ?? []).some(
		(product) =>
			productKeyToState({
				productKey: productToProductKey({ product }),
				productStatesContext,
			}).customerUsage.hasVersionableCustomerProducts,
	);

/** One intent → one UpsertProductPlan. Demoted sibling attaches in `computeUpsertProductPlan`. */
export const intentToUpsertProductPlan = ({
	ctx,
	intent,
	productStatesContext,
	declaredVariantPlanIdsByBasePlanId,
}: {
	ctx: AutumnContext;
	intent: ProductUpsertIntent;
	productStatesContext: ProductStatesContext;
	declaredVariantPlanIdsByBasePlanId?: Map<string, Set<string>>;
}): UpsertProductPlan => {
	const { productKey, source, baseInternalProductId } = intent;
	const { currentFullProduct, customerUsage } = productKeyToState({
		productKey,
		productStatesContext,
	});
	const versioning = resolveUpsertVersioning({
		planParams: intent.planParams,
		source,
	});
	const pointer = resolveUpsertVariantPointer({
		intent,
		source,
		planId: productKey.planId,
		currentFullProduct,
		productStatesContext,
		declaredVariantPlanIdsByBasePlanId,
	});
	const unlink = pointer === null;

	// Content baseline: row at this version, or the active row when minting.
	const baseFullProduct =
		currentFullProduct ??
		(versioning === "new_version"
			? activeFullProductForPlan({
					planId: productKey.planId,
					productStatesContext,
				})
			: null);
	const planParams = planParamsFromEditDiff({
		planParams: intent.planParams,
		editDiff: intent.editDiff,
		currentFullProduct: currentFullProduct ?? baseFullProduct,
	});

	// variant_link clones content via planParams, not baseFullProduct — the
	// folded base is still the Stripe baseline (processor + price id carry).
	const variantBaseFullProduct =
		source === "variant_link" && baseInternalProductId
			? findFullProductByInternalId({
					internalId: baseInternalProductId,
					productStatesContext,
				})
			: null;

	const currentActive = activeFullProductForPlan({
		planId: productKey.planId,
		productStatesContext,
	});
	const maxVersion = maxVersionForPlan({
		planId: productKey.planId,
		productStatesContext,
	});
	const details = computeProductDetailsPlan({
		ctx,
		planParams,
		currentFullProduct,
		version: productKey.version,
		baseFullProduct,
		currentActive,
		latestExistingVersion: maxVersion === 0 ? undefined : maxVersion,
		...(pointer !== undefined ? { baseInternalProductId: pointer } : {}),
		...(variantBaseFullProduct
			? { baseProcessor: variantBaseFullProduct.processor }
			: {}),
	});

	const freeTrialPlan = computeFreeTrialPlan({
		freeTrialParams: planParams.free_trial,
		currentFreeTrial: baseFullProduct?.free_trial ?? null,
		internalProductId: details.product.internal_id,
		mode:
			versioning === "new_version" ? { type: "version" } : { type: "update" },
	});

	const entitlementPricesPlan = computeCatalogEntitlementPricesPlan({
		ctx,
		product: details.product,
		baseFullProduct,
		planParams,
		versioning,
		protectReferencedRows: shouldProtectReferencedCatalogRows({
			usage: customerUsage,
		}),
		...(variantBaseFullProduct
			? {
					stripeCandidates: {
						prices: variantBaseFullProduct.prices,
						entitlements: variantBaseFullProduct.entitlements,
					},
				}
			: {}),
	});

	const nextFullProduct = assembleNextFullProduct({
		product: details.product,
		entitlementPricesPlan,
		freeTrial: freeTrialPlan.projected,
		features: ctx.features,
		currentFullProduct: baseFullProduct,
	});
	const aliasReplacement = resolveAliasReplacement({
		claimedId: nextFullProduct.id,
		aliases: ctx.org.planAliases,
	});

	const op = resolveUpsertOp({
		currentFullProduct,
		detailsChanged: details.changed,
		entitlementPricesPlan,
		freeTrialChanged: freeTrialPlan.changed,
	});
	const declaredVariants = declaredVariantsForSource({
		source,
		variants: planParams.variants,
	});

	return {
		row: {
			planId: productKey.planId,
			version: productKey.version,
			op,
			source,
			versioning,
			currentFullProduct,
			// Mint-only clone source for preview; null on in-place writes.
			baseFullProduct:
				versioning === "new_version" ? baseFullProduct : null,
			nextFullProduct,
		},
		...(details.changed ? { details } : {}),
		...(entitlementPricesPlan ? { entitlementPricesPlan } : {}),
		...(freeTrialPlan.changed ? { freeTrialPlan } : {}),
		// Direct / variant_link send licenses[]. Siblings rebase via editDiff.
		...((source === "direct" ||
			source === "all_versions" ||
			source === "variant_link") &&
		planParams.licenses !== undefined
			? { declaredLicenses: planParams.licenses }
			: {}),
		...(intent.editDiff?.upsert_licenses !== undefined
			? { upsertLicenses: intent.editDiff.upsert_licenses }
			: {}),
		...(intent.editDiff?.remove_licenses !== undefined
			? { removeLicenses: intent.editDiff.remove_licenses }
			: {}),
		...(declaredVariants !== undefined ? { declaredVariants } : {}),
		...(unlink ? { unlink: true } : {}),
		...(source === "direct" && planParams.propagate !== undefined
			? { propagate: planParams.propagate }
			: {}),
		...(planParams.create_in_stripe !== undefined
			? { createInStripe: planParams.create_in_stripe }
			: {}),
		...(aliasReplacement ? { aliasReplacement } : {}),
		...(details.product.active &&
		currentActive &&
		currentActive.internal_id !== details.product.internal_id
			? { previousActiveInternalId: currentActive.internal_id }
			: {}),
		state: {
			hasCustomers:
				versioning === "new_version"
					? planHasVersionableCustomers({
							planId: productKey.planId,
							productStatesContext,
						})
					: customerUsage.hasVersionableCustomerProducts,
			planHadLiveVersions:
				(productStatesContext.versionsByPlanId[productKey.planId] ?? []).length >
				0,
		},
	};
};
