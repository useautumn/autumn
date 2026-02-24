import {
	type Entitlement,
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	InternalError,
	OnIncrease,
	type Price,
	priceToInvoiceAmount,
	shouldCreateInvoiceItem,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RepService } from "@/internal/customers/cusProducts/cusEnts/RepService.js";
import { roundUsage } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { getUsageFromBalance } from "../adjustAllowance.js";
import { createUpgradeProrationInvoice } from "./createUpgradeProrationInvoice.js";

interface UsageValues {
	prevRoundedUsage: number;
	newRoundedUsage: number;
	prevRoundedOverage: number;
	newRoundedOverage: number;
}

export const getPrevAndNewPriceForUpgrade = ({
	ent,
	// numReplaceables,
	price,
	newBalance,
	prevBalance,
	logger,
}: {
	ent: Entitlement;
	// numReplaceables: number;
	price: Price;
	newBalance: number;
	prevBalance: number;
	logger: any;
}) => {
	const { usage: prevUsage, overage: prevOverage } = getUsageFromBalance({
		ent,
		price,
		balance: prevBalance,
	});

	const { usage: newUsage, overage: newOverage } = getUsageFromBalance({
		ent,
		price,
		balance: newBalance,
	});

	const prevPrice = priceToInvoiceAmount({
		price,
		overage: roundUsage({
			// usage: prevUsage,
			usage: prevOverage,
			price,
		}),
	});

	const newPrice = priceToInvoiceAmount({
		price,
		overage: roundUsage({
			// usage: newUsage,
			usage: newOverage,
			price,
		}),
	});

	return {
		// prevOverage,
		// newOverage,
		newUsage,
		// prevUsage,
		prevPrice,
		newPrice,
	};
};

export function getReps({
	cusEnt,
	prevBalance,
	newBalance,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	prevBalance: number;
	newBalance: number;
}) {
	const usageDiff = prevBalance - newBalance;
	const reps = cusEnt.replaceables.slice(0, usageDiff);
	return reps;
}

export const handleProratedUpgrade = async ({
	ctx,
	stripeCli,
	cusEnt,
	cusPrice,
	sub,
	subItem,
	newBalance,
	prevBalance,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	cusEnt: FullCusEntWithFullCusProduct;
	cusPrice: FullCustomerPrice;
	sub: Stripe.Subscription;
	subItem: Stripe.SubscriptionItem;
	newBalance: number;
	prevBalance: number;
}) => {
	const { logger } = ctx;
	logger.info(`Handling quantity increase`);

	if (!cusEnt.customer_product) {
		throw new InternalError({
			message: `[handleProratedUpgrade] Customer entitlement has no customer product: ${cusEnt.id}`,
		});
	}

	// 1. Get num reps to use
	const reps = getReps({
		cusEnt,
		prevBalance,
		newBalance,
	});
	newBalance = newBalance + reps.length; // Increase new balance by number of reps

	const { prevPrice, newPrice, newUsage } = getPrevAndNewPriceForUpgrade({
		ent: cusEnt.entitlement,
		price: cusPrice.price,
		newBalance,
		prevBalance,
		logger,
	});

	const config = cusPrice.price.config as UsagePriceConfig;
	const product = cusEnt.customer_product.product;
	const feature = cusEnt.entitlement.feature;

	const onIncrease =
		cusPrice.price.proration_config?.on_increase ||
		OnIncrease.ProrateImmediately;

	const newRoundedUsage = roundUsage({
		usage: newUsage,
		price: cusPrice.price,
	});

	let invoice = null;
	if (shouldCreateInvoiceItem(onIncrease) && sub.status !== "trialing") {
		invoice = await createUpgradeProrationInvoice({
			ctx,
			cusPrice,
			stripeCli,
			sub,
			subItem,
			newPrice,
			prevPrice,
			newRoundedUsage,
			feature,
			product,
			config,
			onIncrease,
		});
	}

	const deleted = await RepService.deleteInIds({
		ctx,
		ids: reps.map((r) => r.id),
	});

	const newQuantity = roundUsage({
		usage: newUsage,
		price: cusPrice.price,
	});

	logger.info(`New sub item quantity: ${newQuantity}`);

	await stripeCli.subscriptionItems.update(subItem.id, {
		quantity: newQuantity,
		proration_behavior: "none",
	});

	logger.info(`Updated sub item ${subItem.id} successfully!`);
	return { deletedReplaceables: deleted, invoice, newReplaceables: [] };
};
