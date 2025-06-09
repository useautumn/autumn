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

export const expectSubQuantityCorrect = async ({
  stripeCli,
  productId,
  usage,
  db,
  org,
  env,
  customerId,
  numReplaceables = 0,
}: {
  stripeCli: Stripe;
  productId: string;
  usage: number;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  customerId: string;
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
  expect(subItem!.quantity).to.equal(usage);

  // Check num replaceables correct
  let cusEnts = cusProduct?.customer_entitlements;
  let cusEnt = cusEnts?.find((ent) => ent.feature_id === TestFeature.Users);

  expect(cusEnt).to.exist;
  expect(cusEnt?.replaceables.length).to.equal(numReplaceables);

  let expectedBalance = cusEnt!.entitlement.allowance! - usage;
  expect(cusEnt!.balance).to.equal(expectedBalance);
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
