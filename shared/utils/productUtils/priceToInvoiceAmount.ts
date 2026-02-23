import { Decimal } from "decimal.js";
import type { UsagePriceConfig } from "../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { BillingType } from "../../models/productModels/priceModels/priceEnums.js";
import type { Price } from "../../models/productModels/priceModels/priceModels.js";
import { Infinite } from "../../models/productModels/productEnums.js";
import {
	type ProductItem,
	UsageModel,
} from "../../models/productV2Models/productItemModels/productItemModels.js";
import { tiersToLineAmount } from "../billingUtils/invoicingUtils/lineItemUtils/tiersToLineAmount.js";
import { isPriceItem } from "../productV2Utils/productItemUtils/getItemType.js";
import {
	calculateProrationAmount,
	type Proration,
} from "../productV2Utils/productItemUtils/getProductItemRes.js";
import { nullish } from "../utils.js";
import { isFixedPrice } from "./priceUtils/classifyPriceUtils.js";
import { getBillingType } from "./priceUtils.js";

/**
 * Prices an arbitrary quantity against a usage price's tier schedule.
 * This is the single entry point for converting a raw unit count into dollars —
 * it does NOT know whether that count represents included allowance, prepaid
 * purchased units, or paid overage. The caller is responsible for passing the
 * correct quantity for the billing context:
 *
 * - **Included usage** (free allowance): pass the size of the free bucket to
 *   find out its monetary value (used internally for proration math).
 * - **Prepaid** (`UsageInAdvance`): pass the quantity the customer is buying
 *   upfront. The result is the immediate charge.
 * - **Pay-per-use overage** (`UsageInArrear`): pass only the units consumed
 *   *above* any included free allowance — i.e. `totalUsage − includedFree`.
 *   Do NOT pass raw total usage here; the caller must subtract the free tier first.
 *
 * @param price - The usage price whose config contains `usage_tiers` and
 *   optionally `billing_units`.
 * @param quantity - The unit count to price. Must already be net of any free
 *   included allowance when called in an overage context.
 * @returns Dollar amount as a number rounded to 10 decimal places.
 */
export const getAmountForQuantity = ({
	price,
	quantity,
}: {
	price: Price;
	quantity: number;
}) => {
	const config = price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;

	return tiersToLineAmount({
		price,
		overage: quantity,
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
		tier_behaviour: item.tier_behaviour,
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
