import {
	type AppEnv,
	type CreateProductV2Params,
	deduplicateArray,
	type Feature,
	mapToProductV2,
	type Organization,
	type ProductV2,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { copyPlanLicenseLinks } from "@/internal/licenses/actions/links/copyPlanLicenseLinks.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { createProduct } from "../../../product/actions/createProduct.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import { ProductService } from "../../ProductService.js";
import { initProductInStripe } from "../../productUtils.js";
import { applyStripeReuseFromVariantFamilies } from "../../stripeResourceUtils/applyStripeReuseFromVariantFamilies.js";
import {
	getTargetBaseInternalIds,
	resolveSourceBasePlanIds,
	withRequiredBases,
} from "./resolveVariantBaseLinks.js";

const conformProductToSchema = (
	product: ProductV2,
): UpdateProductV2Params & CreateProductV2Params => {
	return {
		id: product.id,
		name: product.name,
		description: product.description ?? null,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		group: product.group ?? "",
		archived: product.archived ?? undefined,
		items: product.items,
		config: product.config,
		billing_controls: product.billing_controls,
		metadata: product.metadata,
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
		return {
			...productV2,
			description: p.description,
			items: productV2.items.map((i) => {
				const {
					price_id: _price_id,
					entitlement_id: _ent_id,
					price_config: _price_config,
					stripe_price_id: _stripe_price_id,
					...rest
				} = i;
				return rest;
			}),
		};
	});

	const newContext = {
		...ctx,
		org: toOrg,
		features: toFeatures,
		env: toEnv,
	};

	const copyOneProduct = ({
		fromProductV2,
		targetBase,
	}: {
		fromProductV2: ProductV2;
		targetBase?: { planId: string; internalId: string };
	}) => {
		const toProductV2 = toProductsV2.find((p) => p.id === fromProductV2.id);

		const conformedProduct = conformProductToSchema(fromProductV2);

		if (toProductV2) {
			return updateProduct({
				ctx: newContext,
				productId: fromProductV2.id,
				query: { disable_version: true },
				updates: targetBase
					? { ...conformedProduct, base_plan_id: targetBase.planId }
					: conformedProduct,
				allowVariantSettingsUpdate: true,
			});
		}
		return createProduct({
			ctx: newContext,
			data: targetBase
				? {
						...conformedProduct,
						base_internal_product_id: targetBase.internalId,
						create_in_stripe: false,
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

	// listFull throws on absent ids — only query bases the target actually has.
	const copiedBaseIds = new Set(baseProductsV2.map((p) => p.id));
	const targetIds = new Set(toProducts.map((p) => p.id));
	const targetBaseInternalIds = await getTargetBaseInternalIds({
		db,
		toOrgId: toOrg.id,
		toEnv,
		basePlanIds: deduplicateArray(
			[...basePlanIdByVariantId.values()].filter(
				(planId) => copiedBaseIds.has(planId) || targetIds.has(planId),
			),
		),
	});

	await Promise.all(
		variantProductsV2.map((fromProductV2) => {
			const basePlanId = basePlanIdByVariantId.get(fromProductV2.id);
			const targetBaseInternalId = basePlanId
				? targetBaseInternalIds.get(basePlanId)
				: undefined;
			if (!basePlanId || !targetBaseInternalId) {
				ctx.logger.warn(
					`copy env: target ${basePlanId} cannot be a variant base, copying ${fromProductV2.id} unlinked`,
				);
				return copyOneProduct({ fromProductV2 });
			}
			return copyOneProduct({
				fromProductV2,
				targetBase: { planId: basePlanId, internalId: targetBaseInternalId },
			});
		}),
	);

	// Licenses are never pulled into the copy set — their features weren't selected.
	const licenseLinks = await planLicenseRepo.listWithLicensePlanIdByParents({
		db,
		parentInternalProductIds: fromProducts.map(
			(product) => product.internal_id,
		),
	});

	// inIds bypasses the products cache — the copy ops' invalidations land
	// async, so a plain listFull can still see the pre-copy (empty) snapshot.
	const copiedToProducts = await ProductService.listFull({
		db,
		orgId: toOrg.id,
		env: toEnv,
		inIds: fromProducts.map((product) => product.id),
	});

	// Created variants deferred Stripe; reuse the base family then init,
	// sequentially like createVariant so siblings can't double-create.
	const createdVariants = copiedToProducts.filter(
		(product) =>
			product.base_internal_product_id !== null && !targetIds.has(product.id),
	);
	await applyStripeReuseFromVariantFamilies({
		ctx: newContext,
		products: createdVariants,
	});
	for (const product of createdVariants) {
		await initProductInStripe({ ctx: newContext, product });
	}

	const copiedIds = new Set(copiedToProducts.map((product) => product.id));
	const existingTargetLicenses = toProducts.filter(
		(product) =>
			!copiedIds.has(product.id) &&
			licenseLinks.some((link) => link.licensePlanId === product.id),
	);

	await copyPlanLicenseLinks({
		db,
		logger: ctx.logger,
		links: licenseLinks,
		toProducts: [...copiedToProducts, ...existingTargetLicenses],
	});
};
