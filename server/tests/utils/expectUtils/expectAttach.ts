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

export const attachAndExpectCorrect = async ({
  autumn,
  customerId,
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
}: {
  autumn: AutumnInt;
  customerId: string;
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
}) => {
  const preview = await autumn.attachPreview({
    customer_id: customerId,
    product_id: product.id,
  });

  const total = getAttachTotal({
    preview,
    options,
  });

  await autumn.attach({
    customer_id: customerId,
    product_id: product.id,
    options: toSnakeCase(options),
  });

  if (waitForInvoice) {
    await timeout(waitForInvoice);
  }

  const customer = await autumn.customers.get(customerId);
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
  });

  const stripeSubs = await stripeCli.subscriptions.list({
    customer: customer.stripe_id,
  });
  if (multiInterval) {
    expect(stripeSubs.data.length).to.equal(2, "should have 2 subscriptions");
  } else {
    expect(stripeSubs.data.length).to.equal(
      1,
      "should only have 1 subscription",
    );
  }
};
