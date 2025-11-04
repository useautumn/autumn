import { type FullCusProduct, isTrialing } from "@autumn/shared";
import type Stripe from "stripe";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
	getLargestInterval,
	intervalsDifferent,
} from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { ACTIVE_STATUSES } from "../../cusProducts/CusProductService.js";
import {
	attachParamsToProduct,
	attachParamToCusProducts,
} from "./convertAttachParams.js";

export const getCycleWillReset = ({
	attachParams,
	stripeSubs,
}: {
	attachParams: AttachParams;
	stripeSubs: Stripe.Subscription[];
}) => {
	const product = attachParamsToProduct({ attachParams });
	const firstInterval = getLargestInterval({ prices: product.prices });
	const prevInterval = subToAutumnInterval(stripeSubs[0]);
	return intervalsDifferent({
		intervalA: firstInterval,
		intervalB: prevInterval,
	});
};

export const removeCurCusProductItems = async ({
	sub,
	cusProduct,
	subItems,
}: {
	sub?: Stripe.Subscription | null;
	cusProduct?: FullCusProduct;
	subItems: any[];
}) => {
	if (!sub || !cusProduct) {
		return subItems;
	}

	const newItems: any[] = structuredClone(subItems);
	for (const item of sub.items.data) {
		const shouldRemove = subItemInCusProduct({
			cusProduct,
			subItem: item,
		});

		if (shouldRemove) {
			newItems.push({
				id: item.id,
				deleted: true,
			});
		}
	}

	return newItems;
};

export const isMainTrialBranch = ({
	attachParams,
}: {
	attachParams: AttachParams;
}) => {
	// 1. get cur main product
	const { curMainProduct } = attachParamToCusProducts({ attachParams });
	if (!isTrialing({ cusProduct: curMainProduct!, now: attachParams.now }))
		return false;

	const subId = curMainProduct?.subscription_ids?.[0];

	if (!subId) return true; // probably free product with trial, can just cancel and replace?

	// 2. Check if sub ID is shared by any other cus products
	const allCusProducts = attachParams.customer.customer_products;
	const otherCusProductsOnSub = allCusProducts.filter(
		(cp) =>
			cp.id !== curMainProduct!.id &&
			ACTIVE_STATUSES.includes(cp.status) &&
			cp.subscription_ids?.includes(subId),
	);

	if (otherCusProductsOnSub.length >= 1) {
		return false;
	}

	return true;
};
