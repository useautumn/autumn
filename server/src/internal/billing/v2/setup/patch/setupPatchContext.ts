import {
	type CustomizePlanV1,
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	isCustomizePlanPatchStyle,
	mapToProductItems,
	orgMultiCurrencyEnabled,
	type PatchContext,
	type SharedContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { isFixedPrice } from "@shared/utils/productUtils/priceUtils/classifyPriceUtils";
import { duplicateCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/duplicateCustomerProduct";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems";
import { generateId } from "@/utils/genUtils";
import { handleCustomizeAddItems } from "./handleCustomizeAddItems";
import { handleCustomizeDeleteItems } from "./handleCustomizeDeleteItems";
import { handleCustomizeNoopItems } from "./handleCustomizeNoopItems";
import { handleCustomizePrice } from "./handleCustomizePrice";
import { handleCustomizeUpdateItems } from "./handleCustomizeUpdateItems";
import type { ReusePricesAndEntitlements } from "./types";

const applyProductDefinitionToCustomerProduct = ({
	fullProduct,
	customerProduct,
}: {
	fullProduct: FullProduct;
	customerProduct: FullCusProduct;
}) => {
	const {
		prices: _prices,
		entitlements: _entitlements,
		free_trial,
		...product
	} = fullProduct;

	customerProduct.internal_product_id = fullProduct.internal_id;
	customerProduct.product = product;
	customerProduct.free_trial = free_trial ?? null;
};

const uniqueCustomerPrices = (
	customerPrices: FullCusProduct["customer_prices"],
) =>
	Array.from(
		new Map(
			customerPrices.map((customerPrice) => [customerPrice.id, customerPrice]),
		).values(),
	);

const applyProductBasePriceToCustomerProduct = ({
	fullProduct,
	customerProduct,
}: {
	fullProduct: FullProduct;
	customerProduct: FullCusProduct;
}) => {
	const productBasePrice = fullProduct.prices.find(isFixedPrice);
	if (!productBasePrice) return;

	const currentBasePrice = customerProduct.customer_prices.find(
		(customerPrice) => isFixedPrice(customerPrice.price),
	);

	if (!currentBasePrice) {
		customerProduct.customer_prices.push({
			id: generateId("cus_price"),
			internal_customer_id: customerProduct.internal_customer_id,
			customer_product_id: customerProduct.id,
			created_at: Date.now(),
			price_id: productBasePrice.id,
			price: productBasePrice,
		});
		return;
	}

	currentBasePrice.price_id = productBasePrice.id;
	currentBasePrice.price = productBasePrice;
};

export const setupPatchContext = ({
	ctx,
	params,
	customerProduct,
	fullProduct,
	reusePricesAndEntitlements,
	includeUpsertLicenses = false,
}: {
	ctx: SharedContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
	fullProduct: FullProduct;
	reusePricesAndEntitlements?: ReusePricesAndEntitlements;
	/** Treat upsert_licenses as patch-style: pools repoint on the same row. */
	includeUpsertLicenses?: boolean;
}): PatchContext | undefined => {
	// Version changes replace the row anyway — upsert-only + version rides
	// the expire+insert path, where transitions carry the pool across rows.
	const upsertsLicenses =
		includeUpsertLicenses &&
		params.version === undefined &&
		(params.customize?.upsert_licenses?.length ?? 0) > 0;
	// The guard also narrows: upsert-only customize is patch-shaped too (no
	// item fields), it just fails the classifier's presence checks.
	const customize = isCustomizePlanPatchStyle(params.customize)
		? params.customize
		: upsertsLicenses
			? ((params.customize ?? {}) as CustomizePlanV1)
			: undefined;
	if (!customize) return undefined;

	const mode =
		params.version !== undefined &&
		params.version !== customerProduct.product.version
			? "new"
			: "existing";

	const finalCustomerProduct =
		mode === "new"
			? duplicateCustomerProduct({
					customerProduct,
					newInternalProductId: fullProduct.internal_id,
				})
			: structuredClone(customerProduct);

	applyProductDefinitionToCustomerProduct({
		fullProduct,
		customerProduct: finalCustomerProduct,
	});

	if (mode === "new" && customize.price === undefined) {
		applyProductBasePriceToCustomerProduct({
			fullProduct,
			customerProduct: finalCustomerProduct,
		});
	}

	const {
		customerPrices: deleteCustomerPrices,
		customerEntitlements: deleteCustomerEntitlements,
	} = handleCustomizeDeleteItems({
		customize,
		targetCustomerProduct: finalCustomerProduct,
	});

	const {
		customerPrices: updateDeleteCustomerPrices,
		customerEntitlements: updateDeleteCustomerEntitlements,
		prices: updateNewPrices,
		entitlements: updateNewEntitlements,
		carryLinks: updateItemCarryLinks,
	} = handleCustomizeUpdateItems({
		customize,
		targetCustomerProduct: finalCustomerProduct,
		features: ctx.features,
	});

	const patchFullProduct = cusProductToProduct({
		cusProduct: finalCustomerProduct,
	});

	// Surface update_items' new entitlements / prices on the patched product
	// snapshot so downstream consumers (initPatchedCustomerEntitlementsAndPrices,
	// add_items noop check) see the updated shape.
	for (const newEnt of updateNewEntitlements) {
		const feature = ctx.features.find(
			(candidate) => candidate.internal_id === newEnt.internal_feature_id,
		);
		if (!feature) continue;
		patchFullProduct.entitlements.push({ ...newEnt, feature });
	}
	patchFullProduct.prices.push(...updateNewPrices);

	const {
		customerPrices: deletePriceCustomerPrices,
		prices: customPricePrices,
	} = handleCustomizePrice({
		ctx,
		customize,
		targetCustomerProduct: finalCustomerProduct,
		fullProduct: patchFullProduct,
		reusePricesAndEntitlements,
	});

	const { addItems: nonNoopAddItems } = handleCustomizeNoopItems({
		customize,
		targetCustomerProduct: finalCustomerProduct,
		features: ctx.features,
	});

	const { prices: customItemPrices, entitlements: customEntitlements } =
		handleCustomizeAddItems({
			ctx,
			customize: { ...customize, add_items: nonNoopAddItems },
			fullProduct: patchFullProduct,
			reusePricesAndEntitlements,
		});

	validateProductItems({
		newItems: mapToProductItems({
			prices: patchFullProduct.prices,
			entitlements: patchFullProduct.entitlements,
			features: ctx.features,
		}),
		features: ctx.features,
		orgId: patchFullProduct.org_id,
		env: patchFullProduct.env,
		multiCurrencyEnabled: orgMultiCurrencyEnabled({ org: ctx.org }),
	});

	const patchContext: PatchContext = {
		originalCustomerProduct: customerProduct,
		mode,
		finalCustomerProduct,
		fullProduct: patchFullProduct,
		insertCustomerPrices: [],
		insertCustomerEntitlements: [],
		deleteCustomerPrices: uniqueCustomerPrices([
			...deleteCustomerPrices,
			...updateDeleteCustomerPrices,
			...deletePriceCustomerPrices,
		]),
		deleteCustomerEntitlements: [
			...deleteCustomerEntitlements,
			...updateDeleteCustomerEntitlements,
		],
		customPrices: [
			...customPricePrices,
			...updateNewPrices,
			...customItemPrices,
		],
		customEntitlements: [...updateNewEntitlements, ...customEntitlements],
		updateItemCarryLinks,
	};

	return patchContext;
};
