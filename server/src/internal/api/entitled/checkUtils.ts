import {
  APIVersion,
  CusEntWithEntitlement,
  Feature,
  Organization,
  SuccessCode,
} from "@autumn/shared";

export const getBooleanEntitledResult = ({
  customer_id,
  cusEnts,
  org,
  res,
  feature,
}: {
  customer_id: string;
  cusEnts: CusEntWithEntitlement[];
  org: Organization;
  res: any;
  feature: Feature;
}) => {
  const allowed = cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id
  );
  let apiVersion = org.api_version || APIVersion.v1_1;
  if (apiVersion >= APIVersion.v1_1) {
    return res.status(200).json({
      customer_id,
      feature_id: feature.id,
      code: SuccessCode.FeatureFound,
      allowed,
    });
  } else {
    return res.status(200).json({
      allowed,
      balances: allowed
        ? [
            {
              feature_id: feature.id,
              balance: null,
            },
          ]
        : [],
    });
  }
};
