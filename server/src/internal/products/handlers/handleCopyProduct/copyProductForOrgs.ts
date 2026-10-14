import {
	type AppEnv,
	ErrCode,
	type Organization,
	ProductAlreadyExistsError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateOrgCatalog } from "@/internal/catalog/actions/invalidateOrgCatalog.js";
import { throwIfPlanIdReservedAsAlias } from "@/internal/catalogV2/productAliases/throwIfPlanIdReservedAsAlias.js";
import { addCreditSystemMeteredFeatureIds } from "@/internal/features/creditSystemUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	copyProduct,
	initProductInStripe,
} from "@/internal/products/productUtils.js";
import { initVariantsInStripe } from "@/internal/products/stripeResourceUtils/initVariantsInStripe.js";
import RecaseError from "@/utils/errorUtils.js";
import { copyBaseVariants } from "./copyBaseVariants.js";
import { copyLicenseLinksForPlanCopy } from "./copyLicenseLinksForPlanCopy.js";
import { copyMissingFeatures } from "./copyMissingFeatures.js";
import { listExistingTargetPlanIds } from "./listExistingTargetPlanIds.js";
import { loadSourcePlanFamily } from "./loadSourcePlanFamily.js";

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

	await throwIfPlanIdReservedAsAlias({
		ctx,
		planId: toId,
		orgId: toOrg.id,
		env: toEnv,
	});

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

	const fromBaseInternalId = fromFullProduct.base_internal_product_id ?? null;
	const copiesWithinCatalog = fromOrg.id === toOrg.id && fromEnv === toEnv;
	if (fromBaseInternalId && !copiesWithinCatalog) {
		throw new RecaseError({
			message:
				"Variant plans can only be copied within the same environment. Copy the base plan instead.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const source = { org: fromOrg, env: fromEnv, features: fromFeatures };
	const toContext = { ...ctx, org: toOrg, env: toEnv, features: toFeatures };
	const crossOrg = fromOrg.id !== toOrg.id;

	const { variants, sourceLicenseLinks, sourceLicensePlans } =
		await loadSourcePlanFamily({ ctx, source, base: fromFullProduct });

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

	const toBaseInternalId = await copyProduct({
		source,
		ctx: toContext,
		product: fromFullProduct,
		toId,
		toName,
		baseInternalProductId: fromBaseInternalId,
	});
	const copiedBase = await ProductService.getFull({
		db,
		idOrInternalId: toBaseInternalId,
		orgId: toOrg.id,
		env: toEnv,
	});
	if (fromBaseInternalId) {
		await initVariantsInStripe({ ctx: toContext, products: [copiedBase] });
	} else {
		await initProductInStripe({ ctx: toContext, product: copiedBase });
	}

	const copiedVariantIds = await copyBaseVariants({
		source,
		toContext,
		variants,
		toBaseInternalId,
	});

	await copyLicenseLinksForPlanCopy({
		source,
		toContext,
		fromBaseId: fromFullProduct.id,
		sourceLinks: sourceLicenseLinks,
		sourceLicensePlans,
		toBaseId: toId,
		copiedVariantIds,
	});

	await invalidateOrgCatalog({ ctx, orgId: toOrg.id, env: toEnv });
	if (crossOrg || fromEnv !== toEnv) {
		await invalidateOrgCatalog({ ctx, orgId: fromOrg.id, env: fromEnv });
	}
};
