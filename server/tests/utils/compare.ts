import {
  AllowanceType,
  CusProductStatus,
  Entitlement,
  Feature,
  FeatureOptions,
  FeatureType,
  FullProduct,
  UsagePriceConfig,
} from "@autumn/shared";
import { expect } from "chai";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { creditSystems } from "tests/global.js";
import { Decimal } from "decimal.js";

export const checkProductIsScheduled = ({
  cusRes,
  product,
}: {
  cusRes: any;
  product: any;
}) => {
  const { products, add_ons, entitlements } = cusRes;
  const prod = products.find((p: any) => p.id === product.id);
  try {
    expect(prod).to.exist;
    expect(prod.status).to.equal(CusProductStatus.Scheduled);
  } catch (error) {
    console.group();
    console.log(`Expected product ${product.id} to be scheduled`);
    console.log("Received: ", cusRes.products);
    console.groupEnd();
    throw error;
  }
};

export const compareMainProduct = ({
  sent,
  cusRes,
  status = CusProductStatus.Active,
  optionsList = [],
}: {
  sent: any;
  cusRes: any;
  status?: CusProductStatus;
  optionsList?: FeatureOptions[];
}) => {
  const { products, add_ons, entitlements } = cusRes;
  const prod = products.find(
    (p: any) => p.id === sent.id && p.status == status && !sent.is_add_on,
  );

  try {
    expect(prod).to.exist;
    expect(sent.id).to.equal(prod.id);
  } catch (error) {
    console.log(`Failed to compare main product ${sent.id}`);
    console.log("Sent: ", sent);
    console.log("Received: ", cusRes);
    throw error;
  }

  // Check entitlements
  let sentEntitlements = Object.values(sent.entitlements) as Entitlement[];
  let recEntitlements = entitlements;

  // expect(sentEntitlements.length).to.equal(recEntitlements.length);
  for (const entitlement of sentEntitlements) {
    // Corresponding entitlement in received
    const recEntitlement = recEntitlements.find((e: any) => {
      if (e.feature_id !== entitlement.feature_id) return false;
      if (entitlement.interval && e.interval !== entitlement.interval)
        return false;
      return true;
    });

    // If options list provideed, and feature
    let options = optionsList.find(
      (o: any) => o.feature_id === entitlement.feature_id,
    );

    let expectedBalance = entitlement.allowance;
    if (options?.quantity) {
      // Get price from sent
      const price = sent.prices.find(
        (p: any) => p.config.feature_id === entitlement.feature_id,
      );
      const config = price.config as UsagePriceConfig;
      expectedBalance = new Decimal(expectedBalance || 0)
        .add(options.quantity * (config.billing_units || 1))
        .toNumber();
    }

    try {
      expect(recEntitlement).to.exist;
      if (entitlement.allowance_type === AllowanceType.Unlimited) {
        expect(recEntitlement.unlimited).to.equal(true);
        expect(recEntitlement.balance).to.equal(null);
        expect(recEntitlement.used).to.equal(null);
      } else if ("balance" in entitlement) {
        expect(recEntitlement.balance).to.equal(expectedBalance);
      }
    } catch (error) {
      console.log(
        `Failed to compare main product (entitlements) ${entitlement.feature_id}`,
      );
      console.log("Looking for entitlement: ", entitlement);
      console.log("Received entitlements: ", entitlements);
      throw error;
    }
  }
};

export const checkFeatureHasCorrectBalance = async ({
  customerId,
  feature,
  entitlement,
  expectedBalance,
}: {
  customerId: string;
  feature: Feature;
  entitlement: Entitlement;
  expectedBalance: number;
}) => {
  const [entitledRes, cusRes] = await Promise.all([
    AutumnCli.entitled(customerId, feature.id, true),
    AutumnCli.getCustomer(customerId),
  ]);

  if (feature.type === FeatureType.Boolean) {
    console.log("     - Checking boolean feature: ", feature.id);
    const { allowed, balanceObj }: any = entitledRes;
    expect(allowed).to.equal(true);
    return;
  }

  // console.log(
  //   `     - Checking entitlement ${feature.id} has ${
  //     entitlement.allowance_type == AllowanceType.Unlimited
  //       ? "unlimited balance"
  //       : `balance of ${expectedBalance}`
  //   }`
  // );

  // Get ent from cusRes
  const { entitlements: cusEnts }: any = cusRes;
  const { allowed, balanceObj }: any = entitledRes;
  const cusEnt = cusEnts.find(
    (e: any) =>
      e.feature_id === feature.id && e.interval == entitlement.interval,
  );

  expect(cusEnt).to.exist;

  if (entitlement.allowance_type === AllowanceType.Unlimited) {
    // Cus ent
    expect(cusEnt.balance).to.equal(null);
    expect(cusEnt.used).to.equal(null);
    expect(cusEnt.unlimited).to.equal(true);

    // Entitled res
    expect(allowed).to.equal(true);
    expect(balanceObj?.balance).to.equal(null);
    expect(balanceObj?.unlimited).to.equal(true);
    return;
  }

  if (expectedBalance === 0) {
    expect(allowed).to.equal(false);
    expect(balanceObj?.balance).to.equal(0);
    expect(cusEnt.balance).to.equal(0);
    return;
  }

  expect(balanceObj?.balance).to.equal(expectedBalance);
  expect(cusEnt.balance).to.equal(expectedBalance);
};

export const compareProductEntitlements = ({
  customerId,
  product,
  features,
  quantity = 1,
}: {
  customerId: string;
  product: any;
  features: Record<string, Feature>;
  quantity?: number;
}) => {
  for (const entitlement of Object.values(
    product.entitlements,
  ) as Entitlement[]) {
    let feature =
      features[entitlement.feature_id!] ||
      creditSystems[entitlement.feature_id as keyof typeof creditSystems];

    checkFeatureHasCorrectBalance({
      customerId,
      feature,
      entitlement,
      expectedBalance: (entitlement.allowance || 0) * quantity,
    });
  }
};
