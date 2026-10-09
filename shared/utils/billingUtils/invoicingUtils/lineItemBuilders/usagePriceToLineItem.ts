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
import {
	isConsumablePrice,
	isPrepaidPrice,
} from "../../../productUtils/priceUtils/classifyPriceUtils";
import { usagePriceToLineDescription } from "../descriptionUtils/usagePriceToLineDescription";
import { priceToLineAmount } from "../lineItemUtils/priceToLineAmount";
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
	let overage = 0;
	if (isPrepaidPrice(cusPrice.price)) {
		overage = cusEntToPrepaidInvoiceOverage({ cusEnt });
	} else {
		overage = cusEntToInvoiceOverage({ cusEnt });
	}

	const allowance = cusEntsToAllowance({ cusEnts: [cusEnt] });

	// 2. Get usage
	let usage = 0;
	if (isPrepaidPrice(cusPrice.price)) {
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

	// 3. Generate description
	const description = usagePriceToLineDescription({
		usage,
		context: lineItemContext,
		includePeriodDescription: options.includePeriodDescription,
	});

	// 4. Get amount
	// Pay-per-use prices only the overage on the stored (net-of-included) tiers, and
	// nothing at all without overage, so a tier's flat_amount never bills included usage.
	const isPrepaid = isPrepaidPrice(price);
	const hasNoPayPerUseOverage = !isPrepaid && overage === 0;
	const amount = hasNoPayPerUseOverage
		? 0
		: priceToLineAmount({
				price,
				overage,
				allowance: isPrepaid ? allowance : 0,
				currency: context.currency,
			});

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
