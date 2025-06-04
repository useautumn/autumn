import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
  AppEnv,
  FeatureOptions,
  Organization,
  ProductV2,
} from "@autumn/shared";
import { getAttachTotal } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectInvoicesCorrect } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { notNullish, timeout } from "@/utils/genUtils.js";
import { expectSubItemsCorrect } from "tests/utils/expectUtils/expectSubUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import Stripe from "stripe";

export const runAttachTest = async ({
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
}) => {
  const res = await autumn.attachPreview({
    customerId,
    productId: product.id,
  });

  const total = getAttachTotal({
    preview: res,
    options,
  });

  await autumn.attach({
    customerId,
    productId: product.id,
    options,
  });

  if (waitForInvoice) {
    await timeout(waitForInvoice);
  }

  const customer = await autumn.customers.get(customerId);

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

  expectFeaturesCorrect({
    customer,
    product,
    usage,
    options,
  });

  await expectSubItemsCorrect({
    stripeCli,
    customerId,
    productId: product.id,
    db,
    org,
    env,
  });
};

export const addPrefixToProducts = ({
  products,
  prefix,
}: {
  products: ProductV2[];
  prefix: string;
}) => {
  for (const product of products) {
    product.id = `${prefix}_${product.id}`;
    product.name = `${prefix} ${product.name}`;
  }

  return products;
};
