import { cusEntsToAllowance } from "@utils/cusEntUtils";
import { cusEntToPrepaidInvoiceOverage } from "@utils/cusEntUtils/balanceUtils/cusEntsToPrepaidInvoiceOverage";
import { Decimal } from "decimal.js";
import { InternalError } from "../../../../api/errors/base/InternalError";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToPrepaidQuantity } from "../../../cusEntUtils/balanceUtils/cusEntsToPrepaidQuantity";
import { cusEntToCusPrice } from "../../../cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { cusEntToStripeIds } from "../../../cusEntUtils/convertCusEntUtils/cusEntToStripeIds";
import { cusEntToInvoiceOverage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceOverage";
import { cusEntToInvoiceUsage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceUsage";
import { cusEntToVolumeInvoiceQuantity } from "../../../cusEntUtils/overageUtils/cusEntToVolumeInvoiceQuantity";
import {
	isConsumablePrice,
	isPrepaidPrice,
	isVolumePrice,
} from "../../../productUtils/priceUtils/classifyPriceUtils";
import { usagePriceToLineDescription } from "../descriptionUtils/usagePriceToLineDescription";
import { volumeUsageToLineDescription } from "../descriptionUtils/volumeUsageToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
import { volumeUsageToTier } from "../lineItemUtils/volumeUsageToTier";
import { buildLineItem } from "./buildLineItem";

export const usagePriceToLineItem = ({
	cusEnt,
	context,
	options = {},
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	context: LineItemContext;
	options?: {
		shouldProrateOverride?: boolean;
		chargeImmediatelyOverride?: boolean;
		includePeriodDescription?: boolean;
		discountable?: boolean;
	};
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	const { feature } = context;

	if (!feature) {
		throw new InternalError({
			message: `[usagePriceToLineItem] No feature found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	if (!cusPrice) {
		throw new InternalError({
			message: `[usagePriceToLineItem] No cus price found for cus ent (feature: ${feature.id})`,
		});
	}

	const price = cusPrice.price;

	// 1. Get overage
	// don't use upcoming quantity for prepaid prices by default. THe price that users have paid currently is quantity.
	const isPrepaid = isPrepaidPrice(price);
	const isUsageBasedVolume = isVolumePrice(price) && !isPrepaid;
	const allowance = cusEntsToAllowance({ cusEnts: [cusEnt] });

	let overage = 0;
	if (isPrepaid) {
		overage = cusEntToPrepaidInvoiceOverage({ cusEnt });
	} else if (isUsageBasedVolume) {
		// Usage-based volume bills the customer's total usage past the included amount.
		const totalUsage = cusEntToVolumeInvoiceQuantity({
			cusEnt,
			paidQuantity: cusEntToInvoiceOverage({ cusEnt }),
		});
		overage = Decimal.max(0, new Decimal(totalUsage).sub(allowance)).toNumber();
	} else {
		overage = cusEntToInvoiceOverage({ cusEnt });
	}

	// 2. Get usage
	let usage = 0;
	if (isPrepaid) {
		const prepaidQuantity = cusEntsToPrepaidQuantity({
			cusEnts: [cusEnt],
			sumAcrossEntities: false,
		});

		usage = new Decimal(allowance).add(prepaidQuantity).toNumber();
	} else {
		usage = cusEntToInvoiceUsage({ cusEnt });
	}

	const lineItemContext: LineItemContext = {
		...context,
		price: cusPrice.price,
		feature: cusEnt.entitlement.feature,
		discountable: options.discountable,
		customerProduct: cusEnt.customer_product ?? undefined,
		customerEntitlement: cusEnt,
	};

	// Pay-per-use at or below the included amount bills nothing, tier 1's flat fee included.
	const isWithinIncluded = !isPrepaid && overage === 0;

	// 3. Generate description
	let description = usagePriceToLineDescription({
		usage,
		context: lineItemContext,
		includePeriodDescription: options.includePeriodDescription,
	});
	if (isUsageBasedVolume && !isWithinIncluded) {
		const billedTier = volumeUsageToTier({
			price,
			overage,
			allowance,
			currency: context.currency,
		});
		if (billedTier) {
			description = volumeUsageToLineDescription({
				...billedTier,
				context: lineItemContext,
				includePeriodDescription: options.includePeriodDescription,
			});
		}
	}

	// 4. Get amount
	// Only prepaid overage includes the allowance, so only prepaid tiers shift by it.
	let tierShift = 0;
	if (isPrepaid) tierShift = allowance;
	let amount = 0;
	if (!isWithinIncluded) {
		amount = priceToLineAmount({
			price,
			overage,
			allowance: tierShift,
			currency: context.currency,
		});
	}

	// 5. Get stripe price / product IDs
	const { stripePriceId, stripeProductId } = cusEntToStripeIds({
		cusEnt,
		currency: context.currency,
	});

	// 6. Should prorate: don't if consumable price (unless override provided)
	const shouldProrate =
		options.shouldProrateOverride ?? !isConsumablePrice(price);

	return buildLineItem({
		context: lineItemContext,
		amount,
		description,

		stripePriceId,
		stripeProductId,

		shouldProrate,
		chargeImmediately: options.chargeImmediatelyOverride,

		usage,
		overage,
	});
};
