import {
	AttachScenario,
	cusProductToProduct,
	type FullCustomer,
	type FullProduct,
	isCusProductCanceled,
} from "@autumn/shared";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { isFreeProduct, isOneOff, isProductUpgrade } from "../../productUtils";

export const getAttachScenario = ({
	fullCus,
	fullProduct,
}: {
	fullCus?: FullCustomer;
	fullProduct: FullProduct;
}) => {
	if (!fullCus) return AttachScenario.New;

	const { curMainProduct, curScheduledProduct } = getExistingCusProducts({
		product: fullProduct,
		cusProducts: fullCus?.customer_products || [],
		internalEntityId: fullCus?.entity?.internal_id,
	});

	if (!curMainProduct || fullProduct.is_add_on) return AttachScenario.New;

	if (isOneOff(fullProduct.prices)) {
		return AttachScenario.New;
	}

	// 1. If current product is the same as the product, return active
	if (curMainProduct?.product.id === fullProduct.id) {
		if (isCusProductCanceled({ cusProduct: curMainProduct })) {
			return AttachScenario.Renew;
		} else return AttachScenario.Active;
	}

	if (curScheduledProduct?.product.id === fullProduct.id) {
		return AttachScenario.Scheduled;
	}

	const curFullProduct = cusProductToProduct({ cusProduct: curMainProduct });

	if (
		isFreeProduct(curFullProduct.prices) &&
		isFreeProduct(fullProduct.prices)
	) {
		return AttachScenario.New;
	}

	const isUpgrade = isProductUpgrade({
		prices1: curFullProduct.prices,
		prices2: fullProduct.prices,
	});

	if (
		!isUpgrade &&
		!isFreeProduct(curFullProduct.prices) &&
		isFreeProduct(fullProduct.prices)
	) {
		return AttachScenario.Cancel;
	}

	return isUpgrade ? AttachScenario.Upgrade : AttachScenario.Downgrade;
};
