import {
	type AttachBodyV0,
	type CreateFreeTrial,
	cusProductToEnts,
	cusProductToPrices,
	type Entitlement,
	type FullCustomer,
	type FullProduct,
	type Price,
} from "@autumn/shared";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import {
	getFreeTrialAfterFingerprint,
	handleNewFreeTrial,
} from "@/internal/products/free-trials/freeTrialUtils.js";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems.js";
import { notNullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../../../../honoUtils/HonoEnv.js";
import { mapOptionsList } from "../../mapOptionsList.js";

export const getPricesAndEnts = async ({
	ctx,
	attachBody,
	customer,
	products,
}: {
	ctx: AutumnContext;
	attachBody: AttachBodyV0;
	customer: FullCustomer;
	products: FullProduct[];
}) => {
	const { options: optionsInput, is_custom, free_trial } = attachBody;
	const { features, db, org, logger } = ctx;

	const { curMainProduct, curSameProduct } = getExistingCusProducts({
		product: products[0],
		cusProducts: customer.customer_products,
		internalEntityId: customer.entity?.internal_id,
	});

	const curCusProduct = curSameProduct || curMainProduct;

	// Not custom
	if (!is_custom) {
		const prices = products.flatMap((p: FullProduct) => p.prices);
		const entitlements = products.flatMap((p: FullProduct) => p.entitlements);

		let freeTrial = null;
		const freeTrialProduct = products.find((p) => notNullish(p.free_trial));

		if (freeTrialProduct) {
			freeTrial = await getFreeTrialAfterFingerprint({
				db,
				freeTrial: freeTrialProduct.free_trial,
				fingerprint: customer.fingerprint,
				internalCustomerId: customer.internal_id,
				internalEntityId: customer.entity?.internal_id,
				multipleAllowed: org.config.multiple_trials,
				productId: freeTrialProduct.id,
			});
		}

		return {
			optionsList: mapOptionsList({
				optionsInput: optionsInput || [],
				features,
				prices,
				curCusProduct,
			}),
			prices,
			entitlements,
			freeTrial,
			cusProducts: customer.customer_products,
		};
	}

	const product = products[0];

	let curPrices: Price[] = product!.prices;
	let curEnts: Entitlement[] = product!.entitlements;

	if (curMainProduct?.product.id === product.id) {
		curPrices = cusProductToPrices({ cusProduct: curMainProduct });
		curEnts = cusProductToEnts({ cusProduct: curMainProduct });
	}

	const {
		prices,
		entitlements: ents,
		customPrices,
		customEnts,
	} = await handleNewProductItems({
		db,
		curPrices,
		curEnts,
		newItems: attachBody.items || [],
		features,
		product,
		logger,
		isCustom: true,
	});

	const freeTrial = await handleNewFreeTrial({
		db,
		curFreeTrial: product!.free_trial,
		newFreeTrial: (free_trial as CreateFreeTrial) || null,
		internalProductId: product!.internal_id,
		isCustom: true,
	});

	const uniqueFreeTrial = await getFreeTrialAfterFingerprint({
		db,
		freeTrial: freeTrial,
		fingerprint: customer.fingerprint,
		internalCustomerId: customer.internal_id,
		internalEntityId: customer.entity?.internal_id,
		multipleAllowed: org.config.multiple_trials,
		productId: product.id,
	});

	return {
		optionsList: mapOptionsList({
			optionsInput: optionsInput || [],
			features,
			prices,
			curCusProduct,
		}),
		prices,
		entitlements: getEntsWithFeature({
			ents,
			features,
		}),
		freeTrial: uniqueFreeTrial,
		customPrices,
		customEnts,
	};
};
