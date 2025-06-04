import { nullish } from "@/utils/genUtils.js";
import { expect } from "chai";
import { notNullish } from "@/utils/genUtils.js";
import { FeatureOptions, Infinite, ProductV2 } from "@autumn/shared";
import { Customer } from "autumn-js";

export const expectFeaturesCorrect = ({
  customer,
  product,
  options,
  usage,
}: {
  customer: Customer;
  product: ProductV2;
  options?: FeatureOptions[];
  usage?: {
    featureId: string;
    value: number;
  }[];
}) => {
  const items = product.items;

  const featureIds = Array.from(
    new Set(product.items.map((i) => i.feature_id)),
  ).filter(notNullish);

  for (const featureId of featureIds) {
    let includedUsage: string | number = 0;

    let item = items.find((i) => i.feature_id === featureId);

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

    // 1. Check that included usage matches
    expect(
      feature?.included_usage,
      `Feature ${featureId} included usage is correct`,
    ).to.equal(includedUsage);

    // 2. Check that unlimited is set correctly
    if (item?.included_usage == Infinite) {
      expect(feature.unlimited, `Feature ${featureId} is unlimited`).to.be.true;
    } else {
      expect(
        feature.unlimited == false || nullish(feature.unlimited),
        `Feature ${featureId} is not unlimited`,
      );
    }

    // 3. Check that usage is correct...
    let featureUsage =
      usage?.reduce((acc, curr) => {
        if (curr.featureId === featureId) {
          acc += curr.value;
        }
        return acc;
      }, 0) || 0;

    expect(feature.usage, `Feature ${featureId} usage is correct`).to.equal(
      featureUsage,
    );
  }
};
