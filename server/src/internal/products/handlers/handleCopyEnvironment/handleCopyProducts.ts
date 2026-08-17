import type { AppEnv, Feature, Organization } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";
import { initVariantsInStripe } from "../../stripeResourceUtils/initVariantsInStripe.js";
import { copyEnvLicenseLinks } from "./copyEnvLicenseLinks.js";
import { copyEnvVariantPlans } from "./copyEnvVariantPlans.js";
import { resolveSourceBasePlanIds } from "./resolveVariantBaseLinks.js";
import { toCopyReadyProductsV2, upsertCopiedPlan } from "./upsertCopiedPlan.js";
import { withLicensePlanProducts } from "./withLicensePlanProducts.js";
import { withPulledInPlans } from "./withPulledInPlans.js";

/**
 * Copies products from one (org, env) into another (org, env).
 *
 * Generalised from the original sandbox→live copy so the source and target may
 * be different organizations (e.g. two sandbox sub-orgs of the same master
 * org). Processor-specific ids (price/entitlement ids, price_config) are
 * stripped so the target gets a clean copy, and the write context is rebuilt
 * around an explicit `toOrg`/`toEnv`.
 */
export const handleCopyProducts = async ({
	ctx,
	fromOrg,
	fromEnv,
	toOrg,
	toEnv,
	productIds,
	fromFeatures: providedFromFeatures,
}: {
	ctx: AutumnContext;
	fromOrg: Organization;
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
	productIds?: string[];
	fromFeatures?: Feature[];
}) => {
	const { db } = ctx;

	// Feature-only copy: nothing to read or map on the product side.
	if (productIds?.length === 0) return;

	// 1. Load both sides
	const [fromFeatures, toFeatures, fromProductsAll, toProducts] =
		await Promise.all([
			providedFromFeatures ??
				FeatureService.list({ db, orgId: fromOrg.id, env: fromEnv }),
			FeatureService.list({ db, orgId: toOrg.id, env: toEnv }),
			ProductService.listFull({ db, orgId: fromOrg.id, env: fromEnv }),
			ProductService.listFull({ db, orgId: toOrg.id, env: toEnv }),
		]);

	// undefined => copy every product (original behavior); a list (incl. empty)
	// => only those ids.
	const requestedFromProducts = productIds
		? fromProductsAll.filter((p) => productIds.includes(p.id))
		: fromProductsAll;

	// 2. Build the copy set: variants pull their bases in, parents pull their
	// license plans in. A same-id target plan is never pulled over.
	const basePlanIdByVariantId = await resolveSourceBasePlanIds({
		ctx,
		fromProducts: requestedFromProducts,
		fromProductsAll,
	});
	const fromProducts = await withLicensePlanProducts({
		ctx,
		fromProducts: withPulledInPlans({
			fromProducts: requestedFromProducts,
			fromProductsAll,
			toProducts,
			planIds: [...basePlanIdByVariantId.values()],
		}),
		fromProductsAll,
		toProducts,
	});

	const toContext = { ...ctx, org: toOrg, features: toFeatures, env: toEnv };
	const targetIds = new Set(toProducts.map((p) => p.id));
	const fromProductsV2 = toCopyReadyProductsV2({
		products: fromProducts,
		features: fromFeatures,
	});

	// 3. Copy bases first: a variant's link resolves against the target env, so
	// its base must exist there before the variant is copied.
	const baseProductsV2 = fromProductsV2.filter(
		(p) => !basePlanIdByVariantId.has(p.id),
	);
	await Promise.all(
		baseProductsV2.map((fromProductV2) =>
			upsertCopiedPlan({ toContext, fromProductV2, targetIds }),
		),
	);

	// 4. Copy variants, linked to their bases in the target env
	const variantProductsV2 = fromProductsV2.filter((p) =>
		basePlanIdByVariantId.has(p.id),
	);
	await copyEnvVariantPlans({
		toContext,
		variantProductsV2,
		basePlanIdByVariantId,
		targetIds,
	});

	// 5. Init created variants in Stripe after their base's family exists.
	// inIds bypasses the products cache — the copy ops' invalidations land
	// async, so a plain listFull can still see the pre-copy (empty) snapshot.
	const copiedToProducts = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: fromProducts.map((product) => product.id),
	});
	const createdVariants = copiedToProducts.filter(
		(product) =>
			product.base_internal_product_id !== null && !targetIds.has(product.id),
	);
	await initVariantsInStripe({ ctx: toContext, products: createdVariants });

	// 6. Recreate the copy set's license links in the target env
	await copyEnvLicenseLinks({
		toContext,
		fromProducts,
		toProducts,
		copiedToProducts,
	});
};
