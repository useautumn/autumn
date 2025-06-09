import Stripe from "stripe";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
  AppEnv,
  AttachBranch,
  FeatureOptions,
  Organization,
  ProductV2,
} from "@autumn/shared";

import { getAttachTotal } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectInvoicesCorrect } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { notNullish, timeout, toSnakeCase } from "@/utils/genUtils.js";
import { expectSubItemsCorrect } from "tests/utils/expectUtils/expectSubUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

import { expect } from "chai";
import { completeCheckoutForm } from "../stripeUtils.js";

export const attachAndExpectCorrect = async ({
  autumn,
  customerId,
  entityId,
  product,
  options,
  stripeCli,
  db,
  org,
  env,
  usage,
  waitForInvoice = 0,
  isCanceled = false,
  skipFeatureCheck = false,
  numSubs = 1,
}: {
  autumn: AutumnInt;
  customerId: string;
  entityId?: string;
  product: ProductV2;
  options?: FeatureOptions[];
  stripeCli: Stripe;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  usage?: {
    featureId: string;
    value: number;
  }[];
  waitForInvoice?: number;
  isCanceled?: boolean;
  skipFeatureCheck?: boolean;
  numSubs?: number;
}) => {
  const preview = await autumn.attachPreview({
    customer_id: customerId,
    product_id: product.id,
    entity_id: entityId,
  });

  const total = getAttachTotal({
    preview,
    options,
  });

  const { checkout_url } = await autumn.attach({
    customer_id: customerId,
    product_id: product.id,
    entity_id: entityId,
    options: toSnakeCase(options),
  });

  if (checkout_url) {
    await completeCheckoutForm(checkout_url);
    await timeout(5000);
  }

  if (waitForInvoice) {
    await timeout(waitForInvoice);
  }

  let customer;
  if (entityId) {
    customer = await autumn.entities.get(customerId, entityId);
  } else {
    customer = await autumn.customers.get(customerId);
  }

  const productCount = customer.products.reduce((acc: number, p: any) => {
    if (product.group == p.group) {
      return acc + 1;
    } else return acc;
  }, 0);

  expect(
    productCount,
    `customer should only have 1 product (from this group: ${product.group})`,
  ).to.equal(1);

  expectProductAttached({
    customer,
    product,
    entityId,
  });

  let intervals = Array.from(
    new Set(product.items.map((item) => item.interval)),
  ).filter(notNullish);
  const multiInterval = intervals.length > 1;

  expectInvoicesCorrect({
    customer,
    first: multiInterval ? undefined : { productId: product.id, total },
    second: multiInterval ? { productId: product.id, total } : undefined,
  });

  if (!skipFeatureCheck) {
    expectFeaturesCorrect({
      customer,
      product,
      usage,
      options,
    });
  }

  const branch = preview.branch;
  if (branch == AttachBranch.OneOff) {
    return;
  }
  await expectSubItemsCorrect({
    stripeCli,
    customerId,
    product,
    db,
    org,
    env,
    isCanceled,
    entityId,
  });

  let cus = await autumn.customers.get(customerId);
  const stripeSubs = await stripeCli.subscriptions.list({
    customer: cus.stripe_id,
  });

  if (numSubs) {
    expect(stripeSubs.data.length).to.equal(
      numSubs,
      `should have ${numSubs} subscriptions`,
    );
  } else if (multiInterval) {
    expect(stripeSubs.data.length).to.equal(2, "should have 2 subscriptions");
  } else {
    expect(stripeSubs.data.length).to.equal(
      1,
      "should only have 1 subscription",
    );
  }
};
