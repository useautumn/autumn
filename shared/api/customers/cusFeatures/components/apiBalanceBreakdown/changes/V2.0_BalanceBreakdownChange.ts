import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
  AffectedResource,
  defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import { z } from "zod/v4";
import { ApiBalanceBreakdownV1Schema } from "../apiBalanceBreakdownV1.js";
import { ApiBalanceBreakdownV0Schema } from "../prevVersions/apiBalanceBreakdownV0.js";
import { BalanceBreakdownLegacyDataSchema } from "../balanceBreakdownLegacyData.js";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels.js";

// Export transform function for use by parent (BalanceChange)
export function transformBreakdownV1ToV0({
  input,
  legacyData,
}: {
  input: z.infer<typeof ApiBalanceBreakdownV1Schema>;
  legacyData?: z.infer<typeof BalanceBreakdownLegacyDataSchema>;
}): z.infer<typeof ApiBalanceBreakdownV0Schema> {
  const { included_grant, prepaid_grant, remaining, price, ...rest } = input;
  
  // Derive overage_allowed from price.usage_model or use legacyData
  const overage_allowed = legacyData?.overage_allowed ?? 
    (price?.usage_model === UsageModel.PayPerUse);
  
  // Get max_purchase from price object or legacyData
  const max_purchase = price?.max_purchase ?? legacyData?.max_purchase ?? null;
  
  return {
    ...rest,
    granted_balance: included_grant,
    purchased_balance: prepaid_grant,
    current_balance: remaining,
    overage_allowed,
    max_purchase,
  };
}

export const V2_0_BalanceBreakdownChange = defineVersionChange({
  newVersion: ApiVersion.V2_1,
  oldVersion: ApiVersion.V2_0,
  description: [
    "Renamed included_grant back to granted_balance",
    "Renamed prepaid_grant back to purchased_balance",
    "Renamed remaining back to current_balance",
    "Restored overage_allowed and max_purchase from price object",
  ],
  affectedResources: [AffectedResource.CusBalance],
  newSchema: ApiBalanceBreakdownV1Schema,
  oldSchema: ApiBalanceBreakdownV0Schema,
  legacyDataSchema: BalanceBreakdownLegacyDataSchema,
  transformResponse: ({ input, legacyData }) => 
    transformBreakdownV1ToV0({ input, legacyData }),
});
