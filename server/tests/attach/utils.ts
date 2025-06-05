import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
  AppEnv,
  AttachBranch,
  BillingInterval,
  Customer,
  FeatureOptions,
  Organization,
  ProductItem,
  ProductV2,
  UsagePriceConfig,
} from "@autumn/shared";
import { getAttachTotal } from "tests/utils/testAttachUtils/testAttachUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectInvoicesCorrect } from "tests/utils/expectUtils/expectProductAttached.js";
import { expectFeaturesCorrect } from "tests/utils/expectUtils/expectFeaturesCorrect.js";
import { notNullish, nullish, timeout, toSnakeCase } from "@/utils/genUtils.js";
import {
  expectSubItemsCorrect,
  getSubsFromCusId,
} from "tests/utils/expectUtils/expectSubUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import Stripe from "stripe";
import { expect } from "chai";
import {
  cusProductToEnts,
  cusProductToPrices,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/getAmountForPrice.js";
import { Decimal } from "decimal.js";

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
    product.group = prefix;
  }

  return products;
};

export const replaceItems = ({
  featureId,
  interval,
  newItem,
  items,
}: {
  featureId?: string;
  interval?: BillingInterval;
  newItem: ProductItem;
  items: ProductItem[];
}) => {
  let newItems = structuredClone(items);

  let index;
  if (featureId) {
    index = newItems.findIndex((item) => item.feature_id == featureId);
  }

  if (interval) {
    index = newItems.findIndex(
      (item) => item.interval == (interval as any) && nullish(item.feature_id),
    );
  }

  if (index == -1) {
    throw new Error("Item not found");
  }

  newItems[index!] = newItem;

  return newItems;
};

export const getExpectedInvoiceTotal = async ({
  customerId,
  productId,
  usage,
  stripeCli,
  db,
  org,
  env,
  onlyIncludeMonthly = false,
}: {
  customerId: string;
  productId: string;
  usage: {
    featureId: string;
    value: number;
  }[];
  stripeCli: Stripe;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  onlyIncludeMonthly?: boolean;
}) => {
  const { cusProduct } = await getSubsFromCusId({
    stripeCli,
    customerId,
    productId,
    db,
    org,
    env,
  });

  const prices = cusProductToPrices({ cusProduct });
  const ents = cusProductToEnts({ cusProduct });

  let total = new Decimal(0);
  for (const price of prices) {
    if (onlyIncludeMonthly && price.config.interval != BillingInterval.Month) {
      continue;
    }

    const config = price.config as UsagePriceConfig;
    const featureId = config.feature_id;
    const ent = getPriceEntitlement(price, ents);

    const usageAmount = usage.find((u) => u.featureId == featureId)?.value;

    const overage =
      usageAmount && ent.allowance ? usageAmount - ent.allowance : usageAmount;

    const invoiceAmt = priceToInvoiceAmount({
      price,
      overage,
    });

    total = total.plus(invoiceAmt);
  }

  return total.toNumber();
};
