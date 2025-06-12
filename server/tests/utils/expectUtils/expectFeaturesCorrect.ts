import { nullish } from "@/utils/genUtils.js";
import { expect } from "chai";
import { notNullish } from "@/utils/genUtils.js";
import {
  CreateEntity,
  FeatureOptions,
  FeatureType,
  Infinite,
  ProductV2,
} from "@autumn/shared";
import { Customer, Entity } from "autumn-js";

export const expectFeaturesCorrect = ({
  customer,
  product,
  options,
  usage,
  entities,
}: {
  customer: Customer | Entity;
  product: ProductV2;
  options?: FeatureOptions[];
  usage?: {
    featureId: string;
    value: number;
  }[];
  entities?: CreateEntity[];
}) => {
  const items = product.items;

  const featureIds = Array.from(
    new Set(product.items.map((i) => i.feature_id)),
  ).filter(notNullish);

  for (const featureId of featureIds) {
    let includedUsage: string | number = 0;

    let item = items.find((i) => i.feature_id === featureId)!;
    expect(item, `Item ${featureId} exists`).to.exist;

    if (item.included_usage === undefined) continue;

    for (const item of items) {
      if (item.feature_id !== featureId) continue;
      if (item.included_usage == Infinite) {
        includedUsage = Infinite;
        break;
      }

      let numEntities =
        entities?.filter((e) => e.feature_id === item.entity_feature_id)
          .length || 1;

      includedUsage += (item.included_usage || 0) * numEntities;
    }

    for (const option of options || []) {
      if (option.feature_id !== featureId) continue;
      if (option.feature_id) {
        (includedUsage as number) += option.quantity;
      }
    }

    const feature = customer.features[featureId!];

    expect(feature, `Feature ${featureId} exists`).to.exist;

    // @ts-ignore

    // 1. Check that included usage matches
    expect(
      feature.included_usage,
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
