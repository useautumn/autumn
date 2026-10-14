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

	if (productIds?.length === 0) return;

	const [fromFeatures, toFeatures, fromProductsAll, toProducts] =
		await Promise.all([
			providedFromFeatures ??
				FeatureService.list({ db, orgId: fromOrg.id, env: fromEnv }),
			FeatureService.list({ db, orgId: toOrg.id, env: toEnv }),
			ProductService.listFull({ db, orgId: fromOrg.id, env: fromEnv }),
			ProductService.listFull({ db, orgId: toOrg.id, env: toEnv }),
		]);

	const requestedFromProducts = productIds
		? fromProductsAll.filter((p) => productIds.includes(p.id))
		: fromProductsAll;

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

	const baseProductsV2 = fromProductsV2.filter(
		(p) => !basePlanIdByVariantId.has(p.id),
	);
	await Promise.all(
		baseProductsV2.map((fromProductV2) =>
			upsertCopiedPlan({ toContext, fromProductV2, targetIds }),
		),
	);

	const variantProductsV2 = fromProductsV2.filter((p) =>
		basePlanIdByVariantId.has(p.id),
	);
	await copyEnvVariantPlans({
		toContext,
		variantProductsV2,
		basePlanIdByVariantId,
		targetIds,
	});

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

	await copyEnvLicenseLinks({
		toContext,
		fromProducts,
		toProducts,
		copiedToProducts,
	});
};
