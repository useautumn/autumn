import {
	type AppEnv,
	type CreateProductV2Params,
	type Feature,
	mapToProductV2,
	type Organization,
	type ProductV2,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import { createProduct } from "../../../product/actions/createProduct.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import { ProductService } from "../../ProductService.js";
import {
	getTargetBaseInternalIds,
	resolveSourceBasePlanIds,
	withRequiredBases,
} from "./resolveVariantBaseLinks.js";

const conformProductToSchema = (
	product: ProductV2,
): UpdateProductV2Params & Omit<CreateProductV2Params, "version"> => {
	return {
		id: product.id,
		name: product.name,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		group: product.group ?? "",
		archived: product.archived ?? undefined,
		items: product.items,
		free_trial: product.free_trial
			? {
					length: product.free_trial.length,
					unique_fingerprint: product.free_trial.unique_fingerprint,
					duration: product.free_trial.duration,
					card_required: product.free_trial.card_required,
					on_end: product.free_trial.on_end,
				}
			: null,
	};
};

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

	const basePlanIdByVariantId = await resolveSourceBasePlanIds({
		db,
		fromProducts: requestedFromProducts,
		fromProductsAll,
	});
	const fromProducts = withRequiredBases({
		fromProducts: requestedFromProducts,
		fromProductsAll,
		toProducts,
		basePlanIdByVariantId,
	});

	const toProductsV2 = toProducts.map((p) =>
		mapToProductV2({ product: p, features: toFeatures }),
	);

	const fromProductsV2 = fromProducts.map((p) => {
		const productV2 = mapToProductV2({
			product: p,
			features: fromFeatures,
		});
		productV2.items = productV2.items.map((i) => {
			const {
				price_id: _price_id,
				entitlement_id: _ent_id,
				price_config: _price_config,
				stripe_price_id: _stripe_price_id,
				...rest
			} = i;
			return rest;
		});

		return productV2;
	});

	const newContext = {
		...ctx,
		org: toOrg,
		features: toFeatures,
		env: toEnv,
	};

	const copyOneProduct = ({
		fromProductV2,
		basePlanId,
		targetBaseInternalId,
	}: {
		fromProductV2: ProductV2;
		basePlanId?: string;
		targetBaseInternalId?: string;
	}) => {
		const toProductV2 = toProductsV2.find((p) => p.id === fromProductV2.id);

		const conformedProduct = conformProductToSchema(fromProductV2);

		if (toProductV2) {
			return updateProduct({
				ctx: newContext,
				productId: fromProductV2.id,
				query: { disable_version: true },
				updates: basePlanId
					? { ...conformedProduct, base_plan_id: basePlanId }
					: conformedProduct,
			});
		}
		return createProduct({
			ctx: newContext,
			data: targetBaseInternalId
				? {
						...conformedProduct,
						base_internal_product_id: targetBaseInternalId,
					}
				: conformedProduct,
		});
	};

	// Bases first: a variant's link resolves against the target env, so its base
	// must exist there before the variant is copied.
	const baseProductsV2 = fromProductsV2.filter(
		(p) => !basePlanIdByVariantId.has(p.id),
	);
	const variantProductsV2 = fromProductsV2.filter((p) =>
		basePlanIdByVariantId.has(p.id),
	);

	await Promise.all(
		baseProductsV2.map((fromProductV2) => copyOneProduct({ fromProductV2 })),
	);

	const targetBaseInternalIds = await getTargetBaseInternalIds({
		db,
		toOrgId: toOrg.id,
		toEnv,
		basePlanIds: [...new Set(basePlanIdByVariantId.values())],
	});

	await Promise.all(
		variantProductsV2.map((fromProductV2) => {
			const basePlanId = basePlanIdByVariantId.get(fromProductV2.id) as string;
			const targetBaseInternalId = targetBaseInternalIds.get(basePlanId);
			return copyOneProduct({
				fromProductV2,
				basePlanId: targetBaseInternalId ? basePlanId : undefined,
				targetBaseInternalId,
			});
		}),
	);

	// inIds bypasses the products cache — the copy ops' invalidations land
	// async, so a plain listFull can still see the pre-copy (empty) snapshot.
	const copiedToProducts = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: fromProducts.map((product) => product.id),
	});
	await copyPlanLicenseLinks({
		db,
		fromProducts,
		toProducts: copiedToProducts,
	});
};
