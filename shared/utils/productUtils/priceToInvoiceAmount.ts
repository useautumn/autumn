import { Decimal } from "decimal.js";
import type { UsagePriceConfig } from "../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { BillingType } from "../../models/productModels/priceModels/priceEnums.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";
import { Infinite } from "../../models/productModels/productEnums.js";
import {
	type ProductItem,
	UsageModel,
} from "../../models/productV2Models/productItemModels/productItemModels.js";
import { calculateGraduatedTiersAmount } from "../billingUtils/invoicingUtils/lineItemUtils/calculateGraduatedTiersAmount.js";
import { isPriceItem } from "../productV2Utils/productItemUtils/getItemType.js";
import {
	calculateProrationAmount,
	type Proration,
} from "../productV2Utils/productItemUtils/getProductItemRes.js";
import { nullish } from "../utils.js";
import { isFixedPrice } from "./priceUtils/classifyPriceUtils.js";
import { getBillingType } from "./priceUtils.js";

export const getAmountForQuantity = ({
	price,
	quantity,
}: {
	price: Price;
	quantity: number;
}) => {
	const config = price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;
	const tiers = config.usage_tiers;

	return calculateGraduatedTiersAmount({
		tiers,
		usage: quantity,
		billingUnits,
	});
};

export const itemToInvoiceAmount = ({
	item,
	quantity,
	overage,
}: {
	item: ProductItem;
	quantity?: number;
	overage?: number;
}) => {
	let amount = 0;
	if (isPriceItem(item)) {
		amount = item.price!;
	}

	if (!nullish(quantity) && !nullish(overage)) {
		throw new Error(
			`itemToInvoiceAmount: quantity or overage is required, autumn item: ${item.feature_id}`,
		);
	}

	const price = {
		config: {
			usage_tiers: item.tiers || [
				{
					to: Infinite,
					amount: item.price!,
				},
			],
			billing_units: item.billing_units || 1,
		},
	} as unknown as Price;

	if (item.usage_model === UsageModel.Prepaid) {
		amount = getAmountForQuantity({ price, quantity: quantity! });
	} else {
		amount = getAmountForQuantity({ price, quantity: overage! });
	}

	return amount;
};

export const priceToInvoiceAmount = ({
	price,
	item,
	quantity,
	productQuantity,
	overage,
	proration,
	now,
}: {
	price?: Price;
	item?: ProductItem;
	quantity?: number; // quantity should be multiplied by billing units
	productQuantity?: number;
	overage?: number;
	proration?: Proration;
	now?: number;
}) => {
	// 1. If fixed price, just return amount

	let amount = 0;

	if (price) {
		if (isFixedPrice(price)) {
			amount = new Decimal(price.config.amount)
				.mul(productQuantity ?? 1)
				.toNumber();
		} else {
			const config = price.config as UsagePriceConfig;
			const billingType = getBillingType(config);

			if (!nullish(quantity) && !nullish(overage)) {
				throw new Error(
					`getAmountForPrice: quantity or overage is required, autumn price: ${price.id}`,
				);
			}

			if (billingType === BillingType.UsageInAdvance) {
				amount = getAmountForQuantity({ price, quantity: quantity! });
			} else {
				amount = getAmountForQuantity({ price, quantity: overage! });
			}
		}
	} else {
		amount = itemToInvoiceAmount({ item: item!, quantity, overage });
	}

	if (proration) {
		return calculateProrationAmount({
			periodEnd: proration.end,
			periodStart: proration.start,
			now: now || Date.now(),
			amount,
			allowNegative: true,
		});
	}

	return amount;
};
