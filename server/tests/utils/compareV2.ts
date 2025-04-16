import { Autumn } from "@/external/autumn/autumnCli.js";
import { CusProductStatus, FeatureOptions } from "@autumn/shared";

export const compareProductV2 = async ({
  autumn,
  sent,
  customerId,
  optionsList = [],
}: {
  autumn: Autumn;
  sent: any;
  customerId: string;
  optionsList?: FeatureOptions[];
}) => {
  let cusRes = await autumn.customers.get(customerId);

  let { products, entitlements } = cusRes;
  let product = products.find((p: any) => p.id === sent.id);
  let entitlement = entitlements.find((e: any) => e.id === sent.id);

  console.log("Product", product);
  console.log("Sent", sent);
};
