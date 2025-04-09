import { Autumn } from "@/external/autumn/autumnCli.js";
import { expect } from "chai";

export const checkBalance = async ({
  autumn,
  featureId,
  customerId,
  expectedBalance,
}: {
  autumn: Autumn;
  featureId: string;
  customerId: string;
  expectedBalance: number;
}) => {
  let { entitlements } = await autumn.customers.get(customerId);
  let entitlement = entitlements.find((e: any) => e.feature_id == featureId);

  expect(entitlement.balance).to.equal(expectedBalance);
}