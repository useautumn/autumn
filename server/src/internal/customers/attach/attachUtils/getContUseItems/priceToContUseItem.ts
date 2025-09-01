import type {
	FullCustomerEntitlement,
	FullEntitlement,
	PreviewLineItem,
	Price,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
	getExistingUsageFromCusProducts,
	getRelatedCusPrice,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { cusProductsToCusPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { priceToInvoiceItem } from "@/internal/products/prices/priceUtils/priceToInvoiceItem.js";
import { shouldProrate } from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { attachParamsToProduct } from "../convertAttachParams.js";
import { getContUseDowngradeItems } from "./getContUseDowngradeItems.js";
import { getContUseUpgradeItems } from "./getContUseUpgradeItems.js";

export const priceToContUseItem = async ({
	price,
	ent,
	prevCusEnt,
	attachParams,
	sub,
	logger,
	curItem,
}: {
	price: Price;
	ent: FullEntitlement;
	prevCusEnt: FullCustomerEntitlement;
	attachParams: AttachParams;
	sub: Stripe.Subscription | undefined;
	logger: any;
	curItem: PreviewLineItem;
}) => {
	const { cusProducts, entities, internalEntityId, now } = attachParams;
	const product = attachParamsToProduct({ attachParams });
	const prevEnt = prevCusEnt?.entitlement;

	const prevCusPrice = getRelatedCusPrice(
		prevCusEnt,
		cusProductsToCusPrices({ cusProducts }),
	)!;

	let { start, end } = subToPeriodStartEnd({ sub });

	if (prevCusPrice) {
		const subItem = findStripeItemForPrice({
			price: prevCusPrice.price,
			stripeItems: sub?.items.data || [],
		});

		if (subItem) {
			start = (subItem as Stripe.SubscriptionItem).current_period_start;
			end = (subItem as Stripe.SubscriptionItem).current_period_end;
		}
	}

	const proration = sub
		? {
				start: start * 1000,
				end: end * 1000,
			}
		: undefined;

	const isDowngrade = ent.allowance! > prevEnt?.allowance!;
	const willProrate = isDowngrade
		? shouldProrate(price.proration_config?.on_decrease)
		: shouldProrate(price.proration_config?.on_increase);

	// 1. Get current usage
	const curUsage = getExistingUsageFromCusProducts({
		entitlement: ent,
		cusProducts,
		entities,
		carryExistingUsages: true,
		internalEntityId,
	});

	// Case 1: Downgrade and no proration
	let res;
	if (isDowngrade && !willProrate) {
		res = await getContUseDowngradeItems({
			price,
			ent,
			prevCusEnt,
			attachParams,
			curItem: curItem!,
			curUsage: curUsage,
			proration,
			logger,
		});
	}

	// Case 2: Upgrade and no proration
	else if (!isDowngrade && !willProrate) {
		res = await getContUseUpgradeItems({
			price,
			ent,
			prevCusEnt,
			attachParams,
			curItem: curItem!,
			curUsage: curUsage,
			proration,
			logger,
		});
	}

	// Case 3: Regular...
	else {
		const newItem = priceToInvoiceItem({
			price,
			ent,
			org: attachParams.org,
			usage: curUsage,
			prodName: product.name,
			proration,
			now,
		});

		res = {
			oldItem: curItem,
			newItem,
			replaceables: [],
		};
	}

	// Clean up items
	// 1. If old item and new item same, remove both
	const oldAmount = res.oldItem?.amount!;
	const newAmount = res.newItem?.amount!;

	if (new Decimal(oldAmount).add(newAmount).eq(0)) {
		return {
			oldItem: null,
			newItems: [res.newUsageItem].filter((item) =>
				notNullish(item),
			) as PreviewLineItem[],
			replaceables: res.replaceables,
		};
	} else {
		return {
			oldItem: res.oldItem,
			newItems: [res.newItem, res.newUsageItem].filter((item) =>
				notNullish(item),
			) as PreviewLineItem[],
			replaceables: res.replaceables,
		};
	}
};
