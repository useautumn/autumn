import {
	AppEnv,
	deduplicateArray,
	ErrCode,
	mapToProductV2,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addCreditSystemMeteredFeatureIds } from "@/internal/features/creditSystemUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { handleCopyFeatures } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyFeatures.js";
import { handleCopyProducts } from "@/internal/products/handlers/handleCopyEnvironment/handleCopyProducts.js";
import { resolveSourceBasePlanIds } from "@/internal/products/handlers/handleCopyEnvironment/resolveVariantBaseLinks.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getOwnedSandbox } from "./getOwnedSandbox.js";

export const copySandboxForOrg = async ({
	ctx,
	masterOrg,
	fromSandboxId,
	fromOrg,
	fromEnv: fromEnvArg,
	toSandboxId,
	productIds,
	featureIds,
}: {
	ctx: AutumnContext;
	masterOrg: Organization;
	fromSandboxId?: string;
	fromOrg?: Organization;
	fromEnv?: AppEnv;
	toSandboxId: string;
	productIds?: string[];
	featureIds?: string[];
}): Promise<{ fromSandbox: Organization; toSandbox: Organization }> => {
	const { db } = ctx;
	if (fromSandboxId && fromSandboxId === toSandboxId) {
		throw new RecaseError({
			message: "Source and target sandboxes must be different",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const toSandbox = await getOwnedSandbox({
		db,
		masterOrg,
		sandboxId: toSandboxId,
	});

	let sourceOrg: Organization;
	let fromEnv: AppEnv;
	if (fromSandboxId) {
		sourceOrg = await getOwnedSandbox({
			db,
			masterOrg,
			sandboxId: fromSandboxId,
		});
		fromEnv = AppEnv.Sandbox;
	} else if (fromOrg && fromEnvArg) {
		if (fromOrg.id !== masterOrg.id) {
			throw new RecaseError({
				message: "Invalid copy source",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		sourceOrg = fromOrg;
		fromEnv = fromEnvArg;
	} else {
		throw new RecaseError({
			message: "No copy source specified",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const toEnv = AppEnv.Sandbox;

	const [fromFeatures, toFeatures] = await Promise.all([
		FeatureService.list({ db, orgId: sourceOrg.id, env: fromEnv }),
		FeatureService.list({ db, orgId: toSandbox.id, env: toEnv }),
	]);

	const selective = productIds !== undefined || featureIds !== undefined;
	let featuresToCopy = fromFeatures;
	let productIdsToCopy = productIds;

	if (selective) {
		const requestedProductIds = productIds ?? [];
		const fromProducts = await ProductService.listFull({
			db,
			orgId: sourceOrg.id,
			env: fromEnv,
		});

		const sourceProductIds = new Set(fromProducts.map((p) => p.id));
		const missingProducts = requestedProductIds.filter(
			(id) => !sourceProductIds.has(id),
		);
		if (missingProducts.length > 0) {
			throw new RecaseError({
				message: `Plan${missingProducts.length > 1 ? "s" : ""} not found in source: ${missingProducts.join(", ")}`,
				code: ErrCode.ProductNotFound,
				statusCode: 404,
			});
		}

		const requestedFeatureIds = featureIds ?? [];
		const sourceFeatureIds = new Set(fromFeatures.map((f) => f.id));
		const missingFeatures = requestedFeatureIds.filter(
			(id) => !sourceFeatureIds.has(id),
		);
		if (missingFeatures.length > 0) {
			throw new RecaseError({
				message: `Feature${missingFeatures.length > 1 ? "s" : ""} not found in source: ${missingFeatures.join(", ")}`,
				code: ErrCode.FeatureNotFound,
				statusCode: 404,
			});
		}

		const basePlanIdByVariantId = await resolveSourceBasePlanIds({
			ctx,
			fromProducts,
			fromProductsAll: fromProducts,
		});
		const requestedProductIdSet = new Set(requestedProductIds);
		const pulledInVariantIds: string[] = [];
		const wantedProductIds = new Set(requestedProductIds);
		for (const [variantId, basePlanId] of basePlanIdByVariantId) {
			if (requestedProductIdSet.has(basePlanId)) {
				pulledInVariantIds.push(variantId);
				wantedProductIds.add(variantId);
			}
			if (requestedProductIdSet.has(variantId)) {
				wantedProductIds.add(basePlanId);
			}
		}

		const licenseLinks = await planLicenseRepo.listWithLicensePlanIdByParents({
			db,
			parentInternalProductIds: fromProducts
				.filter((product) => wantedProductIds.has(product.id))
				.map((product) => product.internal_id),
		});
		for (const link of licenseLinks) {
			wantedProductIds.add(link.licensePlanId);
		}

		const wantedFeatureIds = new Set(requestedFeatureIds);
		for (const product of fromProducts) {
			if (!wantedProductIds.has(product.id)) continue;
			const { items } = mapToProductV2({ product, features: fromFeatures });
			for (const item of items) {
				if (item.feature_id) wantedFeatureIds.add(item.feature_id);
			}
		}

		addCreditSystemMeteredFeatureIds({
			features: fromFeatures,
			featureIds: wantedFeatureIds,
		});

		featuresToCopy = fromFeatures.filter((f) => wantedFeatureIds.has(f.id));
		productIdsToCopy = deduplicateArray([
			...requestedProductIds,
			...pulledInVariantIds,
		]);
	}

	await handleCopyFeatures({
		toContext: { ...ctx, org: toSandbox, env: toEnv, features: toFeatures },
		fromFeatures: featuresToCopy,
	});

	await handleCopyProducts({
		ctx,
		fromOrg: sourceOrg,
		fromEnv,
		toOrg: toSandbox,
		toEnv,
		productIds: productIdsToCopy,
		fromFeatures,
	});

	await invalidateProductsCache({ orgId: toSandbox.id, env: toEnv });

	return { fromSandbox: sourceOrg, toSandbox };
};
