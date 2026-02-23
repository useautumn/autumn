import { expect } from "bun:test";
import {
	type AppEnv,
	cusProductToPrices,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { findContUsePrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { notNullish, timeout } from "@/utils/genUtils.js";

export const expectSubQuantityCorrect = async ({
	stripeCli,
	productId,
	usage,
	db,
	org,
	env,
	customerId,
	itemQuantity,
	numReplaceables = 0,
}: {
	stripeCli: Stripe;
	productId: string;
	usage: number;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customerId: string;
	itemQuantity?: number;
	numReplaceables?: number;
}) => {
	const fullCus = await CusService.getFull({
		ctx: { db, org, env } as any,
		idOrInternalId: customerId,
	});

	const cusProduct = fullCus.customer_products.find(
		(cp) => cp.product_id === productId,
	);

	const stripeSubs = await getStripeSubs({
		stripeCli,
		subIds: cusProduct?.subscription_ids,
	});

	const subItems = stripeSubs.flatMap((sub) => sub.items.data);
	const prices = cusProductToPrices({ cusProduct: cusProduct! });

	const contPrice = findContUsePrice({ prices });

	const subItem = findStripeItemForPrice({
		price: contPrice!,
		stripeItems: subItems,
	});

	expect(subItem).toBeDefined();

	expect(subItem!.quantity).toBe(
		notNullish(itemQuantity) ? itemQuantity : usage,
	);

	// Check num replaceables correct
	const cusEnts = cusProduct?.customer_entitlements;
	const cusEnt = cusEnts?.find((ent) => ent.feature_id === TestFeature.Users);

	expect(cusEnt).toBeDefined();
	expect(cusEnt?.replaceables.length).toBe(numReplaceables);

	const expectedBalance = cusEnt!.entitlement.allowance! - usage;
	expect(cusEnt!.balance).toBe(expectedBalance);

	return {
		fullCus,
		cusProduct,
		stripeSubs,
	};
};

export const calcProrationAndExpectInvoice = async ({
	autumn,
	stripeSubs,
	customerId,
	quantity,
	unitPrice,
	curUnix,
	numInvoices,
}: {
	autumn: AutumnInt;
	stripeSubs: Stripe.Subscription[];
	customerId: string;
	quantity: number;
	unitPrice: number;
	curUnix: number;
	numInvoices: number;
}) => {
	const customer = await autumn.customers.get(customerId);
	const invoices = customer.invoices;

	const sub = stripeSubs[0];
	const amount = quantity * unitPrice;
	const { start, end } = subToPeriodStartEnd({ sub });
	let proratedAmount = calculateProrationAmount({
		amount,
		periodStart: start * 1000,
		periodEnd: end * 1000,
		now: curUnix,
		allowNegative: true,
	});

	proratedAmount = Number(proratedAmount.toFixed(2));

	expect(invoices.length).toBe(numInvoices);
	expect(invoices[0].total).toBe(proratedAmount);
};

export const useEntityBalanceAndExpect = async ({
	autumn,
	customerId,
	featureId,
	entityId,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	entityId: string;
}) => {
	const deduction = new Decimal(Math.random() * 400)
		.toDecimalPlaces(5)
		.toNumber();

	const balanceBefore = await autumn.check({
		customer_id: customerId,
		feature_id: featureId,
		entity_id: entityId,
	});

	await autumn.track({
		customer_id: customerId,
		feature_id: featureId,
		value: deduction,
		entity_id: entityId,
	});
	await timeout(3000);

	const balanceAfter = await autumn.check({
		customer_id: customerId,
		feature_id: featureId,
		entity_id: entityId,
	});

	const expectedBalance = new Decimal(balanceBefore.balance!)
		.sub(deduction)
		.toNumber();

	expect(balanceAfter.balance).toBe(expectedBalance);
};
