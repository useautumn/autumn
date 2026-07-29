import {
	AttachScenario,
	customerProductToEffectivePrices,
	type FullCustomer,
	type FullProduct,
	isCustomerProductCanceling,
	isCustomerProductFree,
	isFreeProduct,
	isOneOffProduct,
	productToEffectivePrices,
} from "@autumn/shared";

import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { isProductUpgrade } from "../../productUtils.js";

export const getAttachScenario = ({
	fullCus,
	fullProduct,
}: {
	fullCus?: FullCustomer;
	fullProduct: FullProduct;
}) => {
	if (!fullCus) return AttachScenario.New;

	const { curMainProduct, curScheduledProduct, curSameProduct } =
		getExistingCusProducts({
			product: fullProduct,
			cusProducts: fullCus?.customer_products || [],
			internalEntityId: fullCus?.entity?.internal_id,
		});

	if (isOneOffProduct({ product: fullProduct })) {
		return AttachScenario.New;
	}

	if (
		fullProduct.is_add_on &&
		!isFreeProduct({ product: fullProduct }) &&
		!isOneOffProduct({ product: fullProduct })
	) {
		// 1. If current same product is add on, and it's canceled
		if (
			curSameProduct &&
			curSameProduct.product.id !== curScheduledProduct?.product.id
		) {
			if (isCustomerProductCanceling(curSameProduct)) {
				return AttachScenario.Renew;
			} else {
				return AttachScenario.Active;
			}
		}
	}

	if (fullProduct.is_add_on) {
		return AttachScenario.New;
	}

	if (!curMainProduct) return AttachScenario.New;

	// 1. If current product is the same as the product, return active
	if (curMainProduct?.product.id === fullProduct.id) {
		if (isCustomerProductCanceling(curMainProduct)) {
			return AttachScenario.Renew;
		} else return AttachScenario.Active;
	}

	if (curScheduledProduct?.product.id === fullProduct.id) {
		return AttachScenario.Scheduled;
	}

	if (
		isCustomerProductFree(curMainProduct) &&
		isFreeProduct({ product: fullProduct })
	) {
		return AttachScenario.New;
	}

	const isUpgrade = isProductUpgrade({
		prices1: customerProductToEffectivePrices({
			customerProduct: curMainProduct,
		}),
		prices2: productToEffectivePrices({ product: fullProduct }),
	});

	if (
		!isUpgrade &&
		!isCustomerProductFree(curMainProduct) &&
		isFreeProduct({ product: fullProduct })
	) {
		return AttachScenario.Cancel;
	}

	return isUpgrade ? AttachScenario.Upgrade : AttachScenario.Downgrade;
};
