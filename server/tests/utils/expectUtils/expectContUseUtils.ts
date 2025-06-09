import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { findStripeItemForPrice } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { findContUsePrice } from "@/internal/products/prices/priceUtils/findPriceUtils.js";
import { AppEnv, FullCustomer, Organization } from "@autumn/shared";
import { expect } from "chai";
import { TestFeature } from "tests/setup/v2Features.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

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

  let cusProduct = fullCus.customer_products.find(
    (cp) => cp.product_id === productId,
  );

  let stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: cusProduct?.subscription_ids,
  });

  let subItems = stripeSubs.flatMap((sub) => sub.items.data);
  let prices = cusProductToPrices({ cusProduct: cusProduct! });

  let contPrice = findContUsePrice({ prices });

  let subItem = findStripeItemForPrice({
    price: contPrice!,
    stripeItems: subItems,
  });

  expect(subItem).to.exist;
  expect(subItem!.quantity).to.equal(itemQuantity || usage);

  // Check num replaceables correct
  let cusEnts = cusProduct?.customer_entitlements;
  let cusEnt = cusEnts?.find((ent) => ent.feature_id === TestFeature.Users);

  expect(cusEnt).to.exist;
  expect(cusEnt?.replaceables.length).to.equal(numReplaceables);

  let expectedBalance = cusEnt!.entitlement.allowance! - usage;
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
  let sub = stripeSubs[0];
  let upcomingLines = await stripeCli.invoices.listUpcomingLines({
    subscription: sub.id,
  });

  let lines = upcomingLines.data.filter((line) => line.type === "invoiceitem");

  let amount = quantity * unitPrice!;
  let proratedAmount = calculateProrationAmount({
    amount,
    periodStart: sub.current_period_start * 1000,
    periodEnd: sub.current_period_end * 1000,
    now: curUnix,
    allowNegative: true,
  });

  console.group();
  console.group("Upcoming lines");
  for (const line of lines) {
    console.log(line.description, line.amount / 100);
  }
  console.groupEnd();
  console.groupEnd();

  expect(lines[0].amount).to.equal(Math.round(proratedAmount * 100));
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
  let customer = await autumn.customers.get(customerId);
  let invoices = customer.invoices;

  let sub = stripeSubs[0];
  let amount = quantity * unitPrice;
  let proratedAmount = calculateProrationAmount({
    amount,
    periodStart: sub.current_period_start * 1000,
    periodEnd: sub.current_period_end * 1000,
    now: curUnix,
    allowNegative: true,
  });

  proratedAmount = Number(proratedAmount.toFixed(2));

  expect(invoices.length).to.equal(
    numInvoices,
    `Should have ${numInvoices} invoices`,
  );
  expect(invoices[0].total).to.equal(
    proratedAmount,
    "Latest invoice should be equals to calculated prorated amount",
  );
};
