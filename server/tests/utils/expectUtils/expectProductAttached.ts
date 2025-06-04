import { notNullish } from "@/utils/genUtils.js";
import {
  CusProductStatus,
  FeatureOptions,
  Infinite,
  ProductV2,
} from "@autumn/shared";
import { Customer } from "autumn-js";
import { expect } from "chai";

export const expectProductAttached = ({
  customer,
  product,
}: {
  customer: Customer;
  product: ProductV2;
}) => {
  const cusProducts = customer.products;
  const productAttached = cusProducts.find((p) => p.id === product.id);

  if (!productAttached) {
    console.log(`product ${product.id} not attached`);
    console.log(cusProducts);
  }

  expect(productAttached, `product ${product.id} is attached`).to.exist;
  expect(
    productAttached?.status,
    `product ${product.id} is not expired`,
  ).to.not.equal(CusProductStatus.Expired);
};

export const expectInvoicesCorrect = ({
  customer,
  first,
  second,
}: {
  customer: Customer;
  first?: {
    productId: string;
    total: number;
  };
  second?: {
    productId: string;
    total: number;
  };
}) => {
  const invoices = customer.invoices;
  if (!invoices) {
    console.log(`invoices is nullish`);
  }

  if (first) {
    try {
      expect(
        invoices![0].total,
        `invoice total is correct: ${first.total}`,
      ).to.equal(first.total);

      expect(
        invoices![0].product_ids,
        `invoice includes product ${first.productId}`,
      ).to.include(first.productId);
    } catch (error) {
      console.log(`invoice for ${first.productId}, ${first.total} not found`);
      throw error;
    }
  }

  if (second) {
    try {
      expect(
        invoices![0].total == second.total ||
          invoices![1].total == second.total,
        `invoice total is correct: ${second.total}`,
      ).to.be.true;
      expect(
        invoices![0].product_ids.includes(second.productId) ||
          invoices![1].product_ids.includes(second.productId),
        `invoices include product ${second.productId}`,
      ).to.be.true;
    } catch (error) {
      console.log(`invoice for ${second.productId}, ${second.total} not found`);
      throw error;
    }
  }
};

export const expectFeaturesCorrect = ({
  customer,
  product,
  options,
}: {
  customer: Customer;
  product: ProductV2;
  options?: FeatureOptions[];
}) => {
  const items = product.items;

  const featureIds = Array.from(
    new Set(product.items.map((i) => i.feature_id)),
  ).filter(notNullish);

  for (const featureId of featureIds) {
    let includedUsage: string | number = 0;
    for (const item of items) {
      if (item.feature_id !== featureId) continue;
      if (item.included_usage == Infinite) {
        includedUsage = Infinite;
        break;
      }

      includedUsage += item.included_usage || 0;
    }

    for (const option of options || []) {
      if (option.feature_id !== featureId) continue;
      if (option.feature_id) {
        (includedUsage as number) += option.quantity;
      }
    }

    const feature = customer.features[featureId!];

    expect(feature, `Feature ${featureId} exists`).to.exist;

    expect(
      feature?.included_usage,
      `Feature ${featureId} included usage is correct`,
    ).to.equal(includedUsage);
  }
};
