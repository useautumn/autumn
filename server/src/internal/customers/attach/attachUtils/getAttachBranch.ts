import {
	type AttachBody,
	AttachBranch,
	AttachErrCode,
	BillingInterval,
	cusProductToPrices,
	cusProductToProduct,
	ErrCode,
	type FeatureOptions,
	type FullCusProduct,
	productsAreSame,
	RecaseError,
} from "@autumn/shared";
import { findPrepaidPrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { hasPrepaidPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import {
	isFreeProduct,
	isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import { isMainTrialBranch } from "./attachUtils.js";
import {
	attachParamToCusProducts,
	getCustomerSub,
} from "./convertAttachParams.js";

const handleMultiProductErrors = async ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { products } = attachParams;

	if (pricesOnlyOneOff(attachParams.prices)) {
		return true;
	}

	for (const product of products) {
		const { curMainProduct, curSameProduct, curScheduledProduct } =
			getExistingCusProducts({
				product,
				cusProducts: attachParams.cusProducts!,
				internalEntityId: attachParams.internalEntityId,
			});

		// 1. If product is add on, allow attach
		if (product.is_add_on) {
			continue;
		}

		// 1. If same product exists, not allowed
		if (curSameProduct) {
			throw new RecaseError({
				message: `Product ${product.name} is already attached, can't attach again`,
				code: ErrCode.InvalidRequest,
			});
		}

		const curPaidProduct =
			curMainProduct &&
			!isFreeProduct(cusProductToPrices({ cusProduct: curMainProduct }));

		// 2. If existing paid product, not allowed
		if (curPaidProduct) {
			throw new RecaseError({
				message: `Upgrade / downgrade to ${product.name} not allowed with multiple products`,
				code: ErrCode.InvalidRequest,
			});
		}

		if (curScheduledProduct) {
			throw new RecaseError({
				message: `Can't attach multiple products at once when scheduled product exists`,
				code: ErrCode.InvalidRequest,
			});
		}
	}
};

const getOptionsToUpdate = ({
	oldOptionsList,
	newOptionsList,
	curSameProduct,
}: {
	oldOptionsList: FeatureOptions[];
	newOptionsList: FeatureOptions[];
	curSameProduct: FullCusProduct;
}) => {
	const optionsToUpdate: { new: FeatureOptions; old: FeatureOptions }[] = [];
	const prices = cusProductToPrices({ cusProduct: curSameProduct });

	for (const newOptions of newOptionsList) {
		const internalFeatureId = newOptions.internal_feature_id;
		const existingOptions = oldOptionsList.find(
			(o) => o.internal_feature_id === internalFeatureId,
		);

		const price = findPrepaidPrice({
			prices,
			internalFeatureId: internalFeatureId!,
		});

		if (price?.config.interval === BillingInterval.OneOff) continue;

		if (existingOptions && existingOptions.quantity !== newOptions.quantity) {
			optionsToUpdate.push({
				new: newOptions,
				old: existingOptions,
			});
		}
	}

	return optionsToUpdate;
};

export const checkSameCustom = async ({
	attachParams,
	curSameProduct,
	fromPreview,
	optionsToUpdate,
}: {
	attachParams: AttachParams;
	curSameProduct: FullCusProduct;
	fromPreview?: boolean;
	optionsToUpdate: { new: FeatureOptions; old: FeatureOptions }[];
}) => {
	const product = attachParams.products[0];

	const { itemsSame, freeTrialsSame, onlyEntsChanged } = productsAreSame({
		newProductV1: {
			...product,
			prices: attachParams.prices,
			entitlements: attachParams.entitlements,
			free_trial: attachParams.freeTrial,
		},
		curProductV1: cusProductToProduct({ cusProduct: curSameProduct }),

		features: attachParams.features,
	});

	if (itemsSame && freeTrialsSame) {
		if (
			fromPreview &&
			hasPrepaidPrice({ prices: attachParams.prices, excludeOneOff: true })
		) {
			return AttachBranch.UpdatePrepaidQuantity;
		}

		// 1. If prepaid quantity changed
		if (optionsToUpdate.length > 0) {
			attachParams.optionsToUpdate = optionsToUpdate;
			return AttachBranch.UpdatePrepaidQuantity;
		}

		throw new RecaseError({
			message: `Items specified for ${product.name} are the same as the existing product, can't attach again`,
			code: ErrCode.InvalidRequest,
		});
	}

	const curPrices = cusProductToPrices({ cusProduct: curSameProduct });
	if (isFreeProduct(curPrices)) {
		return AttachBranch.MainIsFree;
	}

	if (onlyEntsChanged) {
		return AttachBranch.SameCustomEnts;
	}

	return AttachBranch.SameCustom;
};

const getSameProductBranch = async ({
	attachParams,
	fromPreview,
}: {
	attachParams: AttachParams;
	fromPreview?: boolean;
}) => {
	const product = attachParams.products[0];

	let { curSameProduct, curScheduledProduct } = attachParamToCusProducts({
		attachParams,
	});

	curSameProduct = curSameProduct!;

	// 1. If new version?

	if (curSameProduct.product.version !== product.version) {
		return AttachBranch.NewVersion;
	}

	const optionsToUpdate = getOptionsToUpdate({
		oldOptionsList: curSameProduct.options,
		newOptionsList: attachParams.optionsList,
		curSameProduct,
	});

	// 2. Same custom?
	if (attachParams.isCustom && curScheduledProduct?.product.id !== product.id) {
		return await checkSameCustom({
			attachParams,
			curSameProduct,
			fromPreview,
			optionsToUpdate,
		});
	}

	// 1. If prepaid quantity changed
	if (optionsToUpdate.length > 0) {
		attachParams.optionsToUpdate = optionsToUpdate;
		return AttachBranch.UpdatePrepaidQuantity;
	}

	// 3. If main product
	if (curScheduledProduct && !product.is_add_on) {
		if (curScheduledProduct.product.id === product.id) {
			throw new RecaseError({
				message: `Product ${product.name} is already scheduled, can't attach again`,
				code: ErrCode.InvalidRequest,
			});
		}

		return AttachBranch.Renew;
	}

	if (curSameProduct.canceled_at || curSameProduct.canceled) {
		return AttachBranch.Renew;
	}

	if (fromPreview) {
		if (hasPrepaidPrice({ prices: attachParams.prices, excludeOneOff: true })) {
			return AttachBranch.UpdatePrepaidQuantity;
		}
	}

	// 2. If add on product
	if (product.is_add_on) {
		return AttachBranch.AddOn;
	}

	// Invalid, can't attach same product
	throw new RecaseError({
		message: `Product ${product.name} is already attached, can't attach again`,
		code: AttachErrCode.ProductAlreadyAttached,
	});
};

const getChangeProductBranch = async ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	const { curMainProduct, curScheduledProduct } = attachParamToCusProducts({
		attachParams,
	});

	// 1. If main product is free, it's the same as adding a new product

	const mainProduct = cusProductToProduct({ cusProduct: curMainProduct! });
	if (isFreeProduct(mainProduct.prices)) {
		return AttachBranch.MainIsFree;
	}

	// 2. If main product is paid, check if upgrade or downgrade
	const curPrices = cusProductToPrices({ cusProduct: curMainProduct! });
	const newPrices = attachParams.prices;

	const isUpgrade = isProductUpgrade({
		prices1: curPrices,
		prices2: newPrices,
	});

	// Check if it's a trial first

	if (isUpgrade) {
		const isTrial = isMainTrialBranch({ attachParams });
		if (isTrial) {
			return AttachBranch.MainIsTrial;
		}

		return AttachBranch.Upgrade;
	}

	return AttachBranch.Downgrade;
};

export const getAttachBranch = async ({
	req,
	attachBody,
	attachParams,
	fromPreview,
}: {
	req: ExtendedRequest;
	attachBody: AttachBody;
	attachParams: AttachParams;
	fromPreview?: boolean;
}) => {
	if (notNullish(attachBody.products)) {
		// 1.
		const { subId } = await getCustomerSub({ attachParams, onlySubId: true });

		if (subId) {
			return AttachBranch.MultiAttachUpdate;
		}
		return AttachBranch.MultiAttach;
	}

	if (pricesOnlyOneOff(attachParams.prices)) {
		return AttachBranch.OneOff;
	}

	if (notNullish(attachBody.product_ids)) {
		await handleMultiProductErrors({ attachParams });
		return AttachBranch.MultiProduct;
	}

	const { curSameProduct, curMainProduct } = attachParamToCusProducts({
		attachParams,
	});

	// 3. Same product
	if (curSameProduct) {
		return await getSameProductBranch({ attachParams, fromPreview });
	}

	const product = attachParams.products[0];
	if (product.is_add_on) {
		return AttachBranch.AddOn;
	}

	// 4. Main product exists
	if (curMainProduct) {
		return getChangeProductBranch({ attachParams });
	}

	return AttachBranch.New;
};
