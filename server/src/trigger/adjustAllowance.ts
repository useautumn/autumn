import {
	type AppEnv,
	BillingType,
	type Customer,
	type Entitlement,
	ErrCode,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	type Organization,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { cusProductToSub } from "../internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { handleProratedDowngrade } from "./arrearProratedUsage/handleProratedDowngrade.js";
import { handleProratedUpgrade } from "./arrearProratedUsage/handleProratedUpgrade.js";

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
	db,
	env,
	org,
	affectedFeature,
	cusEnt,
	cusPrices,
	customer,
	originalBalance,
	newBalance,
	logger,
	errorIfIncomplete = false,
	// deduction,
	// product,
	// fromEntities = false,
}: {
	db: DrizzleCli;
	env: AppEnv;
	affectedFeature: Feature;
	org: Organization;
	cusEnt: FullCusEntWithFullCusProduct;
	cusPrices: FullCustomerPrice[];
	customer: Customer;
	originalBalance: number;
	newBalance: number;
	logger: any;
	errorIfIncomplete?: boolean;
}) => {
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

	// const sub = await getUsageBasedSub({
	// 	db,
	// 	stripeCli,
	// 	subIds: cusProduct.subscription_ids!,
	// 	feature: affectedFeature,
	// });

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
			db,
			stripeCli,
			cusEnt,
			cusPrice,
			sub,
			subItem: subItem as Stripe.SubscriptionItem,
			newBalance,
			prevBalance: originalBalance,
			org,
			logger,
		});
	} else {
		return await handleProratedDowngrade({
			db,
			org,
			stripeCli,
			cusEnt,
			cusPrice,
			sub,
			subItem: subItem as Stripe.SubscriptionItem,
			newBalance,
			prevBalance: originalBalance,
			logger,
		});
	}
};

// Today in DB:
// Balance: How much is given every month
// granted_adjustment: how much free balance is granted (for that cycle)
// free_balance: how much free balance is left
