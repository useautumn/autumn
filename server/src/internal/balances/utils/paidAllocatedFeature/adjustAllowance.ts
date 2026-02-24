import {
	BillingType,
	type Customer,
	type Entitlement,
	ErrCode,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { handleProratedDowngrade } from "./createPaidAllocatedInvoice/handleProratedDowngrade.js";
import { handleProratedUpgrade } from "./createPaidAllocatedInvoice/handleProratedUpgrade.js";

export const getUsageFromBalance = ({
	ent,
	price,
	balance,
}: {
	ent: Entitlement;
	price: Price;
	balance: number;
}) => {
	const config = price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;

	// Should get overage...
	const overage = -Math.min(0, balance);
	const roundedOverage = new Decimal(overage)
		.div(billingUnits)
		.ceil()
		.mul(billingUnits)
		.toNumber();

	const usage = new Decimal(ent.allowance!).sub(balance).toNumber();

	let roundedUsage = usage;
	if (overage > 0) {
		roundedUsage = new Decimal(usage)
			.div(billingUnits)
			.ceil()
			.mul(billingUnits)
			.toNumber();
	}

	return { usage, roundedUsage, overage, roundedOverage };
};

export const adjustAllowance = async ({
	ctx,
	affectedFeature,
	cusEnt,
	cusPrices,
	customer,
	originalBalance,
	newBalance,
	errorIfIncomplete = false,
}: {
	ctx: AutumnContext;
	affectedFeature: Feature;
	cusEnt: FullCusEntWithFullCusProduct;
	cusPrices: FullCustomerPrice[];
	customer: Customer;
	originalBalance: number;
	newBalance: number;
	errorIfIncomplete?: boolean;
}) => {
	const { logger, org, env } = ctx;
	const cusPrice = getRelatedCusPrice(cusEnt, cusPrices);
	const billingType = cusPrice ? getBillingType(cusPrice.price.config!) : null;
	const cusProduct = cusEnt.customer_product;

	// TODO: TRACK

	if (
		!cusProduct ||
		!cusPrice ||
		billingType !== BillingType.InArrearProrated ||
		originalBalance === newBalance
	) {
		return { newReplaceables: [], invoice: null, deletedReplaceables: null };
	}

	const ent = cusEnt.entitlement;
	if (ent.usage_limit && newBalance < ent.allowance! - (ent.usage_limit || 0)) {
		throw new RecaseError({
			message: `Balance exceeds usage limit of ${cusEnt.entitlement.usage_limit}`,
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	logger.info(`--------------------------------`);
	logger.info(`Updating arrear prorated usage: ${affectedFeature.name}`);
	logger.info(`Customer: ${customer.name}, Org: ${org.slug}`);

	const stripeCli = createStripeCli({ org, env });
	const sub = await cusProductToSub({
		cusProduct,
		stripeCli,
	});

	if (!sub) {
		logger.error("adjustAllowance: no usage-based sub found");
		return { newReplaceables: null, invoice: null, deletedReplaceables: null };
	}

	const subItem = findStripeItemForPrice({
		price: cusPrice.price,
		stripeItems: sub.items.data,
	});

	if (!subItem) {
		logger.error("adjustAllowance: no sub item found");
		return { newReplaceables: null, invoice: null, deletedReplaceables: null };
	}

	const isUpgrade = newBalance < originalBalance;

	if (isUpgrade) {
		return await handleProratedUpgrade({
			ctx,
			stripeCli,
			cusEnt,
			cusPrice,
			sub,
			subItem: subItem as Stripe.SubscriptionItem,
			newBalance,
			prevBalance: originalBalance,
		});
	} else {
		return await handleProratedDowngrade({
			ctx,
			stripeCli,
			cusEnt,
			cusPrice,
			sub,
			subItem: subItem as Stripe.SubscriptionItem,
			newBalance,
			prevBalance: originalBalance,
		});
	}
};

// Today in DB:
// Balance: How much is given every month
// granted_adjustment: how much free balance is granted (for that cycle)
// free_balance: how much free balance is left
