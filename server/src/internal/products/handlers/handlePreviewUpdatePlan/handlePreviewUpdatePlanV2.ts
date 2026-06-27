import {
	type Entitlement,
	apiPlan,
	applyDiff,
	diffPlanV1,
	ErrCode,
	type FullProduct,
	type Price,
	mapToProductV2,
	mergeBillingControls,
	PreviewUpdatePlanParamsV2Schema,
	type ProductV2,
	productsAreSame,
	RecaseError,
	Scopes,
	type UpdatePlanParams,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { itemToPriceAndEnt } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt.js";
import { getEntsWithFeature } from "../../entitlements/entitlementUtils.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handlePreviewUpdatePlanV2 = createRoute({
	scopes: [Scopes.Plans.Read],
	body: PreviewUpdatePlanParamsV2Schema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const {
			plan_id,
			new_plan_id,
			disable_version,
			version,
			force_version,
			propagate_to_variants,
			...planParams
		} = body;
		const ctx = c.get("ctx");
		const { db, org, env, features } = ctx;

		const base = await ProductService.getFull({
			db,
			idOrInternalId: plan_id,
			orgId: org.id,
			env,
		});

		if (base.base_internal_product_id != null) {
			throw new RecaseError({
				message: "Cannot preview update on a variant plan",
				code: ErrCode.CannotPreviewOnVariant,
			});
		}

		const curProductV2 = mapToProductV2({ product: base, features });
		const hypotheticalPatch = apiPlan.map.paramsV1ToProductV2({
			ctx,
			currentFullProduct: base,
			params: {
				id: new_plan_id ?? plan_id,
				...planParams,
			},
		});
		const hypothetical: ProductV2 = {
			...curProductV2,
			...hypotheticalPatch,
			items: hypotheticalPatch.items ?? curProductV2.items,
			billing_controls: mergeBillingControls(
				curProductV2.billing_controls,
				hypotheticalPatch.billing_controls,
			),
		};

		const { itemsSame, freeTrialsSame, billingControlsSame } = productsAreSame({
			newProductV2: hypothetical,
			curProductV1: base,
			features,
		});
		const productSame = itemsSame && freeTrialsSame && billingControlsSame;

		const baseCusProducts = await CusProductService.getByInternalProductId({
			db,
			internalProductId: base.internal_id,
			limit: 1,
		});
		const will_version = !productSame && baseCusProducts.length > 0;

		const apiPlanBase = await getPlanResponse({
			ctx,
			product: base,
			features,
		});

		const hypPrices: Price[] = [];
		const hypEnts: Entitlement[] = [];
		for (const item of hypothetical.items) {
			const feature = features.find((f) => f.id === item.feature_id);
			const { newEnt, newPrice, sameEnt, samePrice } =
				itemToPriceAndEnt({
					item,
					orgId: org.id,
					internalProductId: base.internal_id,
					feature,
					isCustom: false,
					features,
				});
			const ent = newEnt || sameEnt;
			const price = newPrice || samePrice;
			if (ent) hypEnts.push(ent);
			if (price) hypPrices.push(price);
		}

		const hypotheticalFullProduct = {
			...base,
			id: hypothetical.id ?? base.id,
			name: hypothetical.name ?? base.name,
			is_add_on: hypothetical.is_add_on ?? base.is_add_on,
			is_default: hypothetical.is_default ?? base.is_default,
			group: hypothetical.group ?? base.group,
			prices: hypPrices,
			entitlements: getEntsWithFeature({
				ents: hypEnts,
				features,
			}),
			free_trial: hypothetical.free_trial ?? base.free_trial,
			config: hypothetical.config ?? base.config,
			metadata: hypothetical.metadata ?? base.metadata,
		} as FullProduct;

		const apiPlanHypothetical = await getPlanResponse({
			ctx,
			product: hypotheticalFullProduct,
			features,
		});
		const diff = diffPlanV1({ from: apiPlanBase, to: apiPlanHypothetical });

		const family = await ProductService.listFull({
			db,
			orgId: org.id,
			env,
			inIds: [base.id],
			returnAll: true,
		});

		const variants = await ProductService.listVariantsByParent({
			db,
			baseInternalProductIds: family.map((p) => p.internal_id),
			orgId: org.id,
			env,
		});

		const affected_variants = await Promise.all(
			variants.map(async (variant) => {
				const apiPlanFromVariant = await getPlanResponse({
					ctx,
					product: variant,
					features,
				});
				const reconstructed = applyDiff({
					base: apiPlanFromVariant,
					diff,
				});

				const variantUpdates = apiPlan.map.paramsV1ToProductV2({
					ctx,
					currentFullProduct: variant,
					params: {
						id: variant.id,
						items: reconstructed.items,
						price: reconstructed.price,
						free_trial: reconstructed.free_trial,
					} as UpdatePlanParams,
				}) as ProductV2;

				const {
					itemsSame: vItemsSame,
					freeTrialsSame: vFreeTrialsSame,
					billingControlsSame: vBillingSame,
				} = productsAreSame({
					newProductV2: variantUpdates,
					curProductV1: variant,
					features,
				});
				const variantSame =
					vItemsSame && vFreeTrialsSame && vBillingSame;

				const variantCusProducts =
					await CusProductService.getByInternalProductId({
						db,
						internalProductId: variant.internal_id,
						limit: 1,
					});

				return {
					id: variant.id,
					name: variant.name,
					latest_version: variant.version,
					would_version:
						!variantSame && variantCusProducts.length > 0,
				};
			}),
		);

		return c.json({
			will_version,
			current_version: base.version,
			diff,
			affected_variants,
		});
	},
});
