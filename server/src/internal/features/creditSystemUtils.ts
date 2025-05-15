import RecaseError from "@/utils/errorUtils.js";
import { CreditSchemaItem, ErrCode, FeatureType } from "@autumn/shared";

import { Feature } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const creditSystemContainsFeature = ({
  creditSystem,
  meteredFeatureId,
}: {
  creditSystem: Feature;
  meteredFeatureId: string;
}) => {
  const schema: CreditSchemaItem[] = creditSystem.config.schema;

  for (const schemaItem of schema) {
    if (schemaItem.metered_feature_id === meteredFeatureId) {
      return true;
    }
  }

  return false;
};

export const getCreditSystemsFromFeature = ({
  featureId,
  features,
}: {
  featureId: string;
  features: Feature[];
}) => {
  return features.filter(
    (f) =>
      f.type == FeatureType.CreditSystem &&
      f.id != featureId &&
      creditSystemContainsFeature({
        creditSystem: f,
        meteredFeatureId: featureId,
      })
  );
};

export const featureToCreditSystem = ({
  featureId,
  creditSystem,
  amount,
}: {
  featureId: string;
  creditSystem: Feature;
  amount: number;
}) => {
  const schema: CreditSchemaItem[] = creditSystem.config.schema;

  for (const schemaItem of schema) {
    if (schemaItem.metered_feature_id === featureId) {
      let creditAmount = schemaItem.credit_amount;
      let featureAmount = schemaItem.feature_amount;

      return new Decimal(creditAmount)
        .div(featureAmount)
        .mul(amount)
        .toNumber();
    }
  }

  return amount;
};
