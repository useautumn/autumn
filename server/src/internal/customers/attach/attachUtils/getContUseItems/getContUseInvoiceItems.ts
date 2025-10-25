import {
	type AttachReplaceable,
	BillingType,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullEntitlement,
	getFeatureInvoiceDescription,
	type PreviewLineItem,
	type Price,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { findCusEnt } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import {
	getExistingUsageFromCusProducts,
	getRelatedCusPrice,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { newPriceToInvoiceDescription } from "@/internal/invoices/invoiceFormatUtils.js";
import { getCurContUseItems } from "@/internal/invoices/previewItemUtils/getCurContUseItems.js";
import { getDefaultPriceStr } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { priceToUsageModel } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { shouldProrate } from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import {
	getBillingType,
	getPriceEntitlement,
	getPriceForOverage,
} from "@/internal/products/prices/priceUtils.js";
import { attachParamsToProduct } from "../convertAttachParams.js";
import { intervalsAreSame } from "../getAttachConfig.js";
import { priceToContUseItem } from "./priceToContUseItem.js";

export const getContUseNewItems = async ({
	price,
	ent,
	attachParams,
	prevCusEnt,
}: {
	price: Price;
	ent: FullEntitlement;
	attachParams: AttachParams;
	prevCusEnt?: FullCustomerEntitlement;
}) => {
	const { org, features } = attachParams;
	const newProduct = attachParamsToProduct({ attachParams });
	const intervalsSame = intervalsAreSame({ attachParams });

	let usage = getExistingUsageFromCusProducts({
		entitlement: ent,
		cusProducts: attachParams.cusProducts,
		entities: attachParams.entities,
		carryExistingUsages: undefined,
		internalEntityId: attachParams.internalEntityId,
	});

	const description = newPriceToInvoiceDescription({
		org,
		price,
		product: newProduct,
		quantity: usage,
	});

	if (usage === 0) {
		return {
			price_id: price.id,
			price: getDefaultPriceStr({ org, price, ent, features }),
			amount: undefined,
			description,
			usage_model: priceToUsageModel(price),
			feature_id: ent.feature_id,
		} as PreviewLineItem;
	} else {
		let overage = new Decimal(usage).sub(ent.allowance!).toNumber();

		if (
			intervalsSame &&
			prevCusEnt &&
			!shouldProrate(price.proration_config?.on_decrease)
		) {
			const isDowngrade = ent.allowance! > prevCusEnt.entitlement.allowance!;
			const prevBalance = prevCusEnt.balance!;

			if (isDowngrade && prevBalance < 0) {
				overage = new Decimal(prevBalance).abs().toNumber();
				usage = ent.allowance! - prevBalance;
			}
		}

		const amount = getPriceForOverage(price, overage);
		const description = getFeatureInvoiceDescription({
			feature: ent.feature,
			usage: usage,
			prodName: newProduct.name,
		});

		return {
			price_id: price.id,
			price: "",
			description,
			amount,
			usage_model: priceToUsageModel(price),
			feature_id: ent.feature_id,
		} as PreviewLineItem;
	}
};

export const getContUseInvoiceItems = async ({
	cusProduct,
	sub,
	attachParams,
	logger,
}: {
	cusProduct?: FullCusProduct;
	sub?: Stripe.Subscription;
	attachParams: AttachParams;
	logger: any;
}) => {
	const cusPrices = cusProduct ? cusProduct.customer_prices : [];
	const cusEnts = cusProduct ? cusProduct.customer_entitlements : [];

	const product = attachParamsToProduct({ attachParams });
	// const allIntervalsSame = intervalsAreSame({ attachParams });
	const curItems = sub
		? await getCurContUseItems({
				sub,
				attachParams,
			})
		: [];

	const newEnts = product.entitlements;
	const oldItems: PreviewLineItem[] = [];
	const newItems: PreviewLineItem[] = [];
	const replaceables: AttachReplaceable[] = [];

	for (const price of product.prices) {
		const billingType = getBillingType(price.config);
		if (billingType !== BillingType.InArrearProrated) {
			continue;
		}

		const ent = getPriceEntitlement(price, newEnts);
		const prevCusEnt = findCusEnt({
			cusEnts,
			feature: ent.feature,
		});

		const prevCusPrice = prevCusEnt
			? getRelatedCusPrice(prevCusEnt, cusPrices)!
			: undefined;

		const curItem = curItems.find(
			(item) => item.price_id === prevCusPrice?.price.id,
		);

		if (!prevCusEnt || !sub || !curItem) {
			const newItem = await getContUseNewItems({
				price,
				ent,
				attachParams,
				prevCusEnt,
			});

			// const prevItem = curItems.find(
			// 	(item) => item.price_id === prevCusPrice?.price.id,
			// );

			newItems.push(newItem);

			if (curItem) {
				oldItems.push(curItem);
			}

			continue;
		}

		const {
			oldItem,
			newItems: newItems_,
			replaceables: replaceables_,
		} = await priceToContUseItem({
			price,
			ent,
			prevCusEnt,
			attachParams,
			sub,
			logger,
			curItem: curItem!,
		});

		if (oldItem) {
			oldItems.push(oldItem);
		}

		newItems.push(...newItems_.filter((item) => item.amount !== 0));
		replaceables.push(...replaceables_);
	}

	// console.log("Replaceables:", replaceables);

	return {
		oldItems,
		newItems,
		replaceables,
	};
};
