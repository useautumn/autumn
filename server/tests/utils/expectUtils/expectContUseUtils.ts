import {
	type AppEnv,
	cusProductToPrices,
	type FullCustomer,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import type Stripe from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { findContUsePrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { notNullish } from "@/utils/genUtils.js";

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
		db,
		orgId: org.id,
		env,
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

	expect(subItem).to.exist;

	expect(subItem!.quantity).to.equal(
		notNullish(itemQuantity) ? itemQuantity : usage,
	);

	// Check num replaceables correct
	const cusEnts = cusProduct?.customer_entitlements;
	const cusEnt = cusEnts?.find((ent) => ent.feature_id === TestFeature.Users);

	expect(cusEnt).to.exist;
	expect(cusEnt?.replaceables.length).to.equal(numReplaceables);

	const expectedBalance = cusEnt!.entitlement.allowance! - usage;
	expect(cusEnt!.balance).to.equal(expectedBalance);

	return {
		fullCus,
		cusProduct,
		stripeSubs,
	};
};

export const expectUpcomingItemsCorrect = async ({
	stripeCli,
	fullCus,
	stripeSubs,
	curUnix,
	unitPrice,
	expectedNumItems = 1,
	quantity,
}: {
	stripeCli: Stripe;
	fullCus: FullCustomer;
	stripeSubs: Stripe.Subscription[];
	curUnix: number;
	unitPrice: number;
	expectedNumItems: number;
	quantity: number;
}) => {
	const sub = stripeSubs[0];
	// let upcomingLines = await stripeCli.invoices.listUpcomingLines({
	//   subscription: sub.id,
	// });
	// const pendingItems = await stripeCli.invoiceItems.list({
	//   pending: true,
	// });

	const lineItems = await stripeCli.invoiceItems.list({
		customer: sub.customer as string,
	});

	const { start, end } = subToPeriodStartEnd({ sub });

	const amount = quantity * unitPrice!;

	const proratedAmount = calculateProrationAmount({
		amount,
		periodStart: start * 1000,
		periodEnd: end * 1000,
		now: curUnix,
		allowNegative: true,
	});

	const firstItem = lineItems.data[0];
	expect(firstItem.amount).to.equal(Math.round(proratedAmount * 100));
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

	expect(invoices.length).to.equal(
		numInvoices,
		`Should have ${numInvoices} invoices; got ${invoices.length}`,
	);
	expect(invoices[0].total).to.equal(
		proratedAmount,
		`Latest invoice should be equals to calculated prorated amount; got ${invoices[0].total}`,
	);
};
