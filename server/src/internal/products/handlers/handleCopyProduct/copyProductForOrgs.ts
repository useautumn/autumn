import {
	type AppEnv,
	type CreateFeature,
	ErrCode,
	type Feature,
	type Organization,
	ProductAlreadyExistsError,
} from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addCreditSystemMeteredFeatureIds } from "@/internal/features/creditSystemUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	copyProduct,
	initProductInStripe,
} from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { copyBaseVariants } from "./copyBaseVariants.js";
import { copyLicenseLinksForPlanCopy } from "./copyLicenseLinksForPlanCopy.js";
import { copyMissingFeatures } from "./copyMissingFeatures.js";
import { listExistingTargetPlanIds } from "./listExistingTargetPlanIds.js";
import { loadSourcePlanFamily } from "./loadSourcePlanFamily.js";

export const initNewFeature = ({
	data,
	orgId,
	env,
}: {
	data: CreateFeature;
	orgId: string;
	env: AppEnv;
}): Feature => ({
	...data,
	org_id: orgId,
	env,
	created_at: Date.now(),
	internal_id: generateId("fe"),
	archived: false,
});

/**
 * Copies a single product between (org, env) pairs. When fromOrg === toOrg this
 * is the classic same-org env-copy; when they differ it's a named-sandbox
 * promote into the master org. The handler owns the auth gate that decides the
 * orgs — this only executes the copy.
 */
export const copyProductForOrgs = async ({
	ctx,
	fromOrg,
	fromEnv,
	toOrg,
	toEnv,
	fromProductId,
	toId,
	toName,
}: {
	ctx: AutumnContext;
	fromOrg: Organization;
	fromEnv: AppEnv;
	toOrg: Organization;
	toEnv: AppEnv;
	fromProductId: string;
	toId: string;
	toName: string;
}): Promise<void> => {
	const { db } = ctx;

	const copyingOntoItself =
		fromOrg.id === toOrg.id && fromEnv === toEnv && fromProductId === toId;
	if (copyingOntoItself) {
		throw new RecaseError({
			message: `Product ID ${toId} already exists in ${toEnv}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const toProduct = await ProductService.get({
		db,
		id: toId,
		orgId: toOrg.id,
		env: toEnv,
	});
	if (toProduct) {
		throw new ProductAlreadyExistsError({
			productId: toId,
			message: `Product ${toId} already exists in ${toEnv}`,
		});
	}

	// 1. Load the source plan and both sides' features
	const [fromFullProduct, fromFeatures, toFeatures] = await Promise.all([
		ProductService.getFull({
			db,
			idOrInternalId: fromProductId,
			orgId: fromOrg.id,
			env: fromEnv,
		}),
		FeatureService.list({ db, orgId: fromOrg.id, env: fromEnv }),
		FeatureService.list({ db, orgId: toOrg.id, env: toEnv }),
	]);

	// A variant's base_internal_product_id points at a product in the source
	// org; there's no safe cross-org remap, so refuse rather than land a dangling
	// reference.
	if (fromFullProduct.base_internal_product_id) {
		throw new RecaseError({
			message:
				"Variant plans can't be copied on their own. Copy the base plan instead.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const source = { org: fromOrg, env: fromEnv, features: fromFeatures };
	const toContext = { ...ctx, org: toOrg, env: toEnv, features: toFeatures };
	const crossOrg = fromOrg.id !== toOrg.id;

	// 2. Load the plan family: variants, license links, and license plans
	const { variants, sourceLicenseLinks, sourceLicensePlans } =
		await loadSourcePlanFamily({ ctx, source, base: fromFullProduct });

	// 3. Copy the features the copied plans reference. A license plan already
	// in the target is reused, not copied, so its features stay out of scope.
	const existingTargetLicensePlanIds = await listExistingTargetPlanIds({
		toContext,
		planIds: sourceLicensePlans.map((licensePlan) => licensePlan.id),
	});
	const licensePlansToCopy = sourceLicensePlans.filter(
		(licensePlan) => !existingTargetLicensePlanIds.has(licensePlan.id),
	);
	const featureIdsToCopy = new Set(
		[fromFullProduct, ...variants, ...licensePlansToCopy].flatMap((product) =>
			product.entitlements.map((entitlement) => entitlement.feature.id),
		),
	);
	addCreditSystemMeteredFeatureIds({
		features: fromFeatures,
		featureIds: featureIdsToCopy,
	});
	if (crossOrg || fromEnv !== toEnv) {
		await copyMissingFeatures({
			source,
			toContext,
			featureIds: featureIdsToCopy,
		});
	}

	// 4. Copy the base and init its Stripe resources
	const toBaseInternalId = await copyProduct({
		source,
		ctx: toContext,
		product: fromFullProduct,
		toId,
		toName,
	});
	const copiedBase = await ProductService.getFull({
		db,
		idOrInternalId: toBaseInternalId,
		orgId: toOrg.id,
		env: toEnv,
	});
	await initProductInStripe({ ctx: toContext, product: copiedBase });

	// 5. Copy the base's variants, relinked to the copied base
	const copiedVariantIds = await copyBaseVariants({
		source,
		toContext,
		variants,
		toBaseInternalId,
	});

	// 6. Recreate the family's license links in the target
	await copyLicenseLinksForPlanCopy({
		source,
		toContext,
		fromBaseId: fromFullProduct.id,
		sourceLinks: sourceLicenseLinks,
		sourceLicensePlans,
		toBaseId: toId,
		copiedVariantIds,
	});

	await invalidateProductsCache({ orgId: toOrg.id, env: toEnv });
	if (crossOrg || fromEnv !== toEnv) {
		await invalidateProductsCache({ orgId: fromOrg.id, env: fromEnv });
	}
};
