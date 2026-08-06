import type {
	CreateProductV2Params,
	Feature,
	FullProduct,
	ProductV2,
	UpdateProductV2Params,
} from "@autumn/shared";
import { mapToProductV2 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createProduct } from "@/internal/product/actions/createProduct.js";
import { updateProduct } from "@/internal/product/actions/updateProduct.js";

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

/** Maps plans to V2 with processor-bound ids stripped, so the target env
 * re-creates its own prices and entitlements. */
export const toCopyReadyProductsV2 = ({
	products,
	features,
}: {
	products: FullProduct[];
	features: Feature[];
}): ProductV2[] =>
	products.map((product) => {
		const productV2 = mapToProductV2({ product, features });
		return {
			...productV2,
			description: product.description,
			items: productV2.items.map((item) => {
				const {
					price_id: _price_id,
					entitlement_id: _ent_id,
					price_config: _price_config,
					stripe_price_id: _stripe_price_id,
					...rest
				} = item;
				return rest;
			}),
		};
	});

/** Creates the plan in the target env, or updates it in place when the id
 * already exists there; a resolved target base links it as a variant. */
export const upsertCopiedPlan = ({
	toContext,
	fromProductV2,
	targetIds,
	targetBase,
}: {
	toContext: AutumnContext;
	fromProductV2: ProductV2;
	targetIds: Set<string>;
	targetBase?: { planId: string; internalId: string };
}) => {
	const conformedProduct = conformProductToSchema(fromProductV2);

	if (targetIds.has(fromProductV2.id)) {
		return updateProduct({
			ctx: toContext,
			productId: fromProductV2.id,
			query: { disable_version: true },
			updates: targetBase
				? { ...conformedProduct, base_plan_id: targetBase.planId }
				: conformedProduct,
			allowVariantSettingsUpdate: true,
		});
	}
	return createProduct({
		ctx: toContext,
		data: targetBase
			? {
					...conformedProduct,
					base_internal_product_id: targetBase.internalId,
					create_in_stripe: false,
				}
			: conformedProduct,
	});
};
