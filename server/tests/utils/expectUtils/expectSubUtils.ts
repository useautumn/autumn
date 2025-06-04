import { DrizzleCli } from "@/db/initDrizzle.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import {
  findStripeItemForPrice,
  isLicenseItem,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { isV4Usage } from "@/internal/products/prices/priceUtils/usagePriceUtils.js";
import { nullish } from "@/utils/genUtils.js";
import {
  AppEnv,
  BillingType,
  FullCusProduct,
  Organization,
} from "@autumn/shared";
import { expect } from "chai";
import { getDate } from "date-fns";

import Stripe from "stripe";

export const expectSubAnchorsSame = async ({
  stripeCli,
  customerId,
  productId,
  db,
  org,
  env,
}: {
  stripeCli: Stripe;
  customerId: string;
  productId: string;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
}) => {
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
  });

  const cusProduct = fullCus.customer_products.find(
    (cp: FullCusProduct) => cp.product.id == productId,
  );

  const subs: Stripe.Subscription[] = await getStripeSubs({
    stripeCli,
    subIds: cusProduct?.subscription_ids,
  });

  let periodEnd = subs[0].current_period_end * 1000;
  let firstDate = getDate(periodEnd);

  for (const sub of subs.slice(1)) {
    let dateOfAnchor = getDate(sub.current_period_end * 1000);
    expect(dateOfAnchor).to.equal(
      firstDate,
      `subscription anchors are the same`,
    );
  }

  return {
    fullCus,
    subs,
  };
};

export const expectSubItemsCorrect = async ({
  stripeCli,
  customerId,
  productId,
  db,
  org,
  env,
}: {
  stripeCli: Stripe;
  customerId: string;
  productId: string;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
}) => {
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
  });

  const cusProduct = fullCus.customer_products.find(
    (cp: FullCusProduct) => cp.product.id == productId,
  )!;

  const subs: Stripe.Subscription[] = await getStripeSubs({
    stripeCli,
    subIds: cusProduct?.subscription_ids,
  });

  const subItems = subs.flatMap((sub) => sub.items.data);
  const prices = cusProductToPrices({ cusProduct });

  let missingUsageCount = 0;

  for (const price of prices) {
    const subItem = findStripeItemForPrice({
      stripeItems: subItems,
      price,
    });

    // 1. If usage + v4 + internalEntityId
    if (isV4Usage({ price, cusProduct })) {
      if (nullish(subItem)) {
        missingUsageCount++;
      }

      expect(
        nullish(subItem) ||
          (subItem?.quantity === 0 && isLicenseItem({ stripeItem: subItem! })),
      ).to.be.true;
      continue;
    } else {
      expect(subItem).to.exist;
    }
  }

  expect(
    prices.length - missingUsageCount,
    "number of sub items equivalent to number of prices",
  ).to.equal(subItems.length);

  // Expect sub anchors to be the same
  let periodEnd = subs[0].current_period_end * 1000;
  let firstDate = getDate(periodEnd);

  for (const sub of subs.slice(1)) {
    let dateOfAnchor = getDate(sub.current_period_end * 1000);
    expect(dateOfAnchor).to.equal(
      firstDate,
      `subscription anchors are the same`,
    );
  }
};
