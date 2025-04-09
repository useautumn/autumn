// 1. Get min next reset at cus ent

import { Feature, FullCustomerEntitlement } from "@autumn/shared";
import { getCusEntBalance, getCusEntMasterBalance, getRelatedCusPrice } from "./cusEntUtils.js";
import { getEntOptions } from "@/internal/prices/priceUtils.js";

export const getMinNextResetAtCusEnt = ({
  cusEnts,
  feature,
}: {
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
}) => {
  return cusEnts
    .filter((cusEnt) => cusEnt.entitlement.internal_feature_id == feature.internal_id)
    .reduce((min, cusEnt) => {
      return Math.min(min, cusEnt.next_reset_at || Infinity);
    }, Infinity);
};

// export const getTotalAllowanceFromCusEnts = ({
//   cusEnts,
//   feature,
// }: {
//   cusEnts: FullCustomerEntitlement[];
//   feature: Feature;
// }) => {
//   return cusEnts
//     .filter((cusEnt) => cusEnt.entitlement.internal_feature_id == feature.internal_id)
//     .reduce((sum, cusEnt) => {
//       let total = let total = (getResetBalance({
//         entitlement: ent,
//         options: getEntOptions(cusProduct.options, ent),
//         relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
//       }) || 0) * count;
  
//       return sum + (cusEnt.entitlement.allowance || 0);
//     }, 0);
// };

// export const getTotalUsedFromCusEnts = ({
//   cusEnts,
//   feature,
//   entityId,
// }: {
//   cusEnts: FullCustomerEntitlement[];
//   feature: Feature;
//   entityId: string;
// }) => {
//   let used = 0;
//   for (const cusEnt of cusEnts) {
//     if (cusEnt.entitlement.internal_feature_id !== feature.internal_id) {
//       continue;
//     }

//     const { balance, adjustment } = getCusEntBalance({
//       cusEnt,
//       entityId,
//     });

//     console.log("balance", balance);
//     console.log("adjustment", adjustment);

//     let allowance = cusEnt.entitlement.allowance || 0;

//     // TODO: Need to get unused

//     used += allowance + (adjustment || 0) - (balance || 0);
//   }
//   return used;
// };