import { CusEntWithEntitlement, Feature } from "@autumn/shared";

export const getBooleanEntitledResult = ({
  cusEnts,
  res,
  feature,
}: {
  cusEnts: CusEntWithEntitlement[];
  res: any;
  feature: Feature;
}) => {
  const allowed = cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id
  );
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
};
