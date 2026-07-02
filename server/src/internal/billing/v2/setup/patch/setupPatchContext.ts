import {
	cusProductToProduct,
	type FullCusProduct,
	type FullProduct,
	isCustomizePlanPatchStyle,
	type PatchContext,
	type SharedContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { isFixedPrice } from "@shared/utils/productUtils/priceUtils/classifyPriceUtils";
import { duplicateCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/duplicateCustomerProduct";
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
}: {
	ctx: SharedContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
	fullProduct: FullProduct;
	reusePricesAndEntitlements?: ReusePricesAndEntitlements;
}): PatchContext | undefined => {
	if (!isCustomizePlanPatchStyle(params.customize)) return undefined;

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

	if (mode === "new" && params.customize?.price === undefined) {
		applyProductBasePriceToCustomerProduct({
			fullProduct,
			customerProduct: finalCustomerProduct,
		});
	}

	const {
		customerPrices: deleteCustomerPrices,
		customerEntitlements: deleteCustomerEntitlements,
	} = handleCustomizeDeleteItems({
		customize: params.customize,
		targetCustomerProduct: finalCustomerProduct,
	});

	const {
		customerPrices: updateDeleteCustomerPrices,
		customerEntitlements: updateDeleteCustomerEntitlements,
		prices: updateNewPrices,
		entitlements: updateNewEntitlements,
		carryLinks: updateItemCarryLinks,
	} = handleCustomizeUpdateItems({
		customize: params.customize ?? {},
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
		customize: params.customize,
		targetCustomerProduct: finalCustomerProduct,
		fullProduct: patchFullProduct,
		reusePricesAndEntitlements,
	});

	const { addItems: nonNoopAddItems } = handleCustomizeNoopItems({
		customize: params.customize,
		targetCustomerProduct: finalCustomerProduct,
		features: ctx.features,
	});

	const { prices: customItemPrices, entitlements: customEntitlements } =
		handleCustomizeAddItems({
			ctx,
			customize: { ...params.customize, add_items: nonNoopAddItems },
			fullProduct: patchFullProduct,
			reusePricesAndEntitlements,
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
		customLicenses: params.customize?.licenses,
	};

	return patchContext;
};
